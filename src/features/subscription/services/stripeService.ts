import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';

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
};

async function redirectToStripe(name: string, body: Record<string, string>, hostname: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as { code?: string } | null;
      if (payload?.code && messages[payload.code]) throw new Error(messages[payload.code]);
    }
    throw new Error('No se pudo conectar con Stripe. Vuelve a intentarlo.');
  }
  let url: URL;
  try { url = new URL(data?.url ?? ''); } catch { throw new Error('Stripe no devolvió un enlace válido.'); }
  if (url.protocol !== 'https:' || url.hostname !== hostname || url.username || url.password) {
    throw new Error('Stripe no devolvió un enlace válido.');
  }
  window.location.assign(url.href);
}

// Hosted Checkout redirects directly to session.url; Stripe.js is installed for future embedded UI.
export function startCheckoutSession(interval: BillingInterval = 'monthly'): Promise<void> {
  return redirectToStripe('create-checkout-session', { interval }, 'checkout.stripe.com');
}
export function openCustomerPortal(): Promise<void> {
  return redirectToStripe('create-portal-session', {}, 'billing.stripe.com');
}
