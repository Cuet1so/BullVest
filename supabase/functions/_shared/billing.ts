import Stripe from 'npm:stripe@23.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

export { Stripe };
export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, 'BILLING_NOT_CONFIGURED');
  return value;
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

export function requestOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  const allowed = requiredEnv('APP_ALLOWED_ORIGINS').split(',').map((item) => item.trim());
  if (!origin || !allowed.includes(origin)) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
  }
  return origin;
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

export function billingHandler(handler: (request: Request, origin: string) => Promise<unknown>) {
  return async (request: Request): Promise<Response> => {
    let headers: Record<string, string> = { 'Vary': 'Origin', 'Cache-Control': 'no-store' };
    try {
      const origin = requestOrigin(request);
      headers = { ...headers, 'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED');
      return Response.json(await handler(request, origin), { headers });
    } catch (error) {
      // Never return Stripe payloads, credentials or user information to the browser/logs.
      console.error('billing_request_failed', error instanceof HttpError ? error.code : 'UPSTREAM_ERROR');
      return Response.json({ code: error instanceof HttpError ? error.code : 'BILLING_UNAVAILABLE' }, {
        status: error instanceof HttpError ? error.status : 502, headers,
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
