import { useRef, useState } from 'react';
import { Crown, LoaderCircle } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { openCustomerPortal, startCheckoutSession } from '../services/stripeService';
import type { BillingInterval } from '../services/stripeService';

export function SubscriptionActions({ compact = false }: { compact?: boolean }) {
  const { profile } = useAuth();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const isPro = profile?.role === 'pro';
  async function run(portal: boolean) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try { await (portal ? openCustomerPortal() : startCheckoutSession(interval)); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo abrir Stripe.');
      busy.current = false; setPending(false);
    }
  }
  return <div className={compact ? 'max-w-52' : 'w-full'}>
    {!isPro && !compact && import.meta.env.VITE_STRIPE_ANNUAL_ENABLED === 'true' &&
      <label className="mb-3 block text-sm text-zinc-300">Facturación
        <select aria-label="Facturación" value={interval} disabled={pending} onChange={(event) => setInterval(event.target.value as BillingInterval)} className="ml-3 rounded-lg bg-zinc-800 p-2">
          <option value="monthly">Mensual</option><option value="annual">Anual</option>
        </select>
      </label>}
    <button type="button" disabled={pending || !profile} onClick={() => void run(isPro)} className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Crown className="size-4" aria-hidden="true" />}
      {pending ? 'Abriendo Stripe…' : isPro ? 'Gestionar suscripción' : 'Pasar a Pro'}
    </button>
    {!isPro && profile?.stripe_customer_id && <button type="button" disabled={pending} onClick={() => void run(true)} className="mt-2 text-xs text-zinc-400 underline disabled:opacity-50">Gestionar suscripción</button>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
  </div>;
}
