import Stripe from 'npm:stripe@23.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

export { Stripe };
export class HttpError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}
export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(500, 'BILLING_NOT_CONFIGURED', `Falta configurar ${name} en Supabase Secrets.`);
  return value;
}

export function validateBillingEnvironment(): void {
  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID'].filter((name) => !Deno.env.get(name)?.trim());
  if (missing.length > 0) {
    throw new HttpError(500, 'BILLING_NOT_CONFIGURED',
      `Falta STRIPE_SECRET_KEY o STRIPE_PRICE_ID en las variables de entorno. Variables ausentes: ${missing.join(', ')}.`);
  }
}
export function stripeClient() {
  return new Stripe(requiredEnv('STRIPE_SECRET_KEY'), {
    httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2,
  });
}
export function adminClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function priceIds(): string[] {
  return [requiredEnv('STRIPE_PRICE_ID'), Deno.env.get('STRIPE_ANNUAL_PRICE_ID')].filter((id): id is string => !!id);
}

export function requestOrigin(
  request: Request,
  allowedOrigins = Deno.env.get('APP_ALLOWED_ORIGINS') || '',
): string {
  const origin = (request.headers.get('origin') || '').trim().replace(/\/$/, '');
  const allowed = allowedOrigins.split(',')
    .map((item) => item.trim().replace(/\/$/, '')).filter(Boolean);
  if (allowed.length > 0 && !allowed.includes('*') && !allowed.includes(origin)) {
    throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
  }
  return origin || '*';
}

export async function authenticatedAccount(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'UNAUTHORIZED');
  const admin = adminClient();
  const { data: { user }, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !user) throw new HttpError(401, 'UNAUTHORIZED');
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id, role, stripe_customer_id, stripe_subscription_id').eq('id', user.id).single();
  if (profileError || !profile) throw new HttpError(500, 'PROFILE_NOT_FOUND');
  return { admin, user, profile };
}

export function billingHandler(
  handler: (request: Request, origin: string) => Promise<unknown>,
  allowedOrigins?: string,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    let headers: Record<string, string> = { 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Request-Id': requestId };
    try {
      const origin = requestOrigin(request, allowedOrigins);
      headers = { ...headers, 'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Expose-Headers': 'X-Request-Id' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED');
      // CORS may be open, but Stripe return URLs still need a concrete HTTP(S) origin.
      let url: URL;
      try { url = new URL(origin); } catch { throw new HttpError(403, 'ORIGIN_NOT_ALLOWED'); }
      if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol)) {
        throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
      }
      return Response.json(await handler(request, origin), { headers });
    } catch (error) {
      const stripeError = error instanceof Stripe.errors.StripeError ? error : null;
      const code = error instanceof HttpError ? error.code : stripeError ? 'STRIPE_REQUEST_FAILED' : 'BILLING_UNAVAILABLE';
      // Log selected diagnostics, never the request, headers or complete Stripe objects.
      const errorMessage = error instanceof Error ? error.message
        : typeof error === 'string' ? error
        : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message
        : 'Error desconocido al procesar la solicitud de facturación.';
      const diagnosticMessage = errorMessage
        .replace(/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_]+\b/g, '[redacted]')
        .replace(/\b(?:whsec_|sb_secret_)[A-Za-z0-9_-]+\b/g, '[redacted]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]');
      console.error('billing_request_failed', {
        request_id: requestId, code, message: diagnosticMessage,
        stripe_code: stripeError?.code, stripe_type: stripeError?.type,
        stripe_param: stripeError?.param, stripe_status: stripeError?.statusCode,
        stripe_request_id: stripeError?.requestId,
      });
      return Response.json({ code, request_id: requestId,
        error: diagnosticMessage, message: diagnosticMessage,
      }, {
        status: error instanceof HttpError ? error.status : 500, headers,
      });
    }
  };
}

export function isBullVestSubscription(subscription: Stripe.Subscription, userId: string, prices: string[]) {
  return subscription.metadata.supabase_user_id === userId &&
    subscription.items.data.some((item) => prices.includes(item.price.id));
}
export function grantsPro(subscription: Stripe.Subscription): boolean {
  if (!['active', 'trialing'].includes(subscription.status)) return false;
  const invoice = subscription.latest_invoice;
  if (invoice && typeof invoice !== 'string' && invoice.status === 'uncollectible') return false;
  return !(invoice && typeof invoice !== 'string' && invoice.status === 'open' &&
    invoice.attempted && invoice.amount_remaining > 0);
}
