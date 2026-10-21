import { FunctionsFetchError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import type { Profile } from '../../auth/context/AuthContext';

export type BillingInterval = 'monthly' | 'annual';
const messages: Record<string, string> = {
  BILLING_NOT_CONFIGURED: 'Los pagos aún no están configurados. Inténtalo más tarde.',
  UNAUTHORIZED: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  SUBSCRIPTION_EXISTS: 'Ya tienes una suscripción. Utiliza Gestionar suscripción para revisarla.',
  CUSTOMER_NOT_FOUND: 'Todavía no tienes una cuenta de facturación en Stripe.',
  ANNUAL_PLAN_UNAVAILABLE: 'El plan anual todavía no está disponible.',
  CHECKOUT_ALREADY_OPEN: 'Ya hay un pago pendiente con otro plan. Completa o espera a que expire antes de cambiarlo.',
  CHECKOUT_ALREADY_COMPLETED: 'Este pago ya se ha procesado. Actualiza tu perfil o revisa tu suscripción.',
  ORIGIN_NOT_ALLOWED: 'Este dominio no está habilitado para pagos.',
  BILLING_UNAVAILABLE: 'El servicio de facturación no está disponible.',
  STRIPE_REQUEST_FAILED: 'Stripe no pudo completar la solicitud. Consulta la referencia con soporte.',
};

export class BillingError extends Error {
  readonly code?: string;
  readonly status?: number;
  constructor(message: string, code?: string, status?: number, cause?: unknown) {
    super(message, { cause });
    this.name = 'BillingError'; this.code = code; this.status = status;
  }
}

// Recover unpaid subscriptions in the portal instead of creating duplicates.
export function shouldOpenPortal(profile: Pick<Profile, 'role' | 'stripe_subscription_id' | 'stripe_subscription_status'>): boolean {
  const status = profile.stripe_subscription_status;
  if (status === 'canceled' || status === 'incomplete_expired') return false;
  return !!status || !!profile.stripe_subscription_id || profile.role === 'pro';
}

let checkedConfiguration = false;
function validatePublishableKey() {
  if (checkedConfiguration) return;
  checkedConfiguration = true;
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key || !/^pk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    console.warn('[Stripe] Configuración del frontend', {
      code: key ? 'INVALID_PUBLISHABLE_KEY' : 'MISSING_PUBLISHABLE_KEY',
      message: 'Configura VITE_STRIPE_PUBLISHABLE_KEY con una clave pk_test_ o pk_live_ y recompila. La redirección a Checkout/Portal alojado puede continuar sin Stripe.js.',
    });
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function billingFailure(name: string, error: unknown, data: unknown, response?: Response): Promise<BillingError> {
  const details = record(error);
  const context = details.context instanceof Response ? details.context : response;
  let payload: unknown = data;
  if (context) {
    try {
      const text = await context.clone().text();
      try { payload = JSON.parse(text); } catch { payload = text; }
    } catch { /* Preserve the original error if the response body is unreadable. */ }
  }
  const fields = record(payload);
  const nested = record(fields.error);
  const code = typeof fields.code === 'string' ? fields.code : typeof nested.code === 'string' ? nested.code : undefined;
  const status = context?.status ?? (typeof details.status === 'number' ? details.status : undefined);
  const originalMessage = error instanceof Error ? error.message : typeof details.message === 'string' ? details.message : 'Respuesta de facturación inválida';
  console.error('[Stripe] Edge Function falló', {
    function: name, message: originalMessage, status, code, data: payload,
    requestId: fields.request_id ?? context?.headers.get('x-request-id'),
  });
  const serverMessage = [fields.message, fields.error, nested.message, fields.details, payload].find((value) => typeof value === 'string' && value.trim());
  const transport = error instanceof FunctionsFetchError || error instanceof FunctionsRelayError;
  const message = (code && messages[code]) || (typeof serverMessage === 'string' ? serverMessage : transport
    ? `No se pudo contactar con la función ${name}. Comprueba la conexión y la configuración CORS. ${originalMessage}`
    : originalMessage);
  const reference = typeof fields.request_id === 'string' ? ` Referencia: ${fields.request_id}.` : '';
  return new BillingError(`${message}${status ? ` (HTTP ${status})` : ''}${reference}`, code, status, error);
}

async function redirectToStripe(name: string, body: Record<string, string>, hostname: string): Promise<void> {
  validatePublishableKey();
  let result;
  try {
    result = await supabase.functions.invoke<unknown>(name, { body, timeout: 20_000 });
  } catch (error) {
    throw await billingFailure(name, error, null);
  }
  const { data, error, response } = result;
  if (error) throw await billingFailure(name, error, data, response);
  const payload = record(data);
  if (payload.error || payload.code) throw await billingFailure(name, new Error('La función devolvió un error'), data, response);
  let url: URL;
  try {
    url = new URL(typeof payload.url === 'string' ? payload.url : '');
    if (url.protocol !== 'https:' || url.hostname !== hostname || url.username || url.password) throw new Error('Destino no permitido');
  } catch (cause) {
    throw await billingFailure(name, new Error('Stripe no devolvió un enlace válido.', { cause }), data, response);
  }
  window.location.assign(url.href);
}

// Hosted Checkout redirects directly to session.url; Stripe.js is installed for future embedded UI.
export async function startCheckoutSession(interval: BillingInterval = 'monthly'): Promise<void> {
  try {
    await redirectToStripe('create-checkout-session', { interval }, 'checkout.stripe.com');
  } catch (error) {
    // Stripe is authoritative when the profile/webhook has not caught up yet.
    if (error instanceof BillingError && error.code === 'SUBSCRIPTION_EXISTS') return openCustomerPortal();
    throw error;
  }
}
export function openCustomerPortal(): Promise<void> {
  return redirectToStripe('create-portal-session', {}, 'billing.stripe.com');
}
