import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, LoaderCircle } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';

export function CheckoutSuccessPage() {
  const { profile, refreshProfile } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isPro = profile?.role === 'pro';
  useEffect(() => {
    if (isPro) return;
    let cancelled = false;
    let timer: number | undefined;
    let tries = 0;
    async function poll() {
      try {
        const updated = await refreshProfile();
        if (cancelled || updated?.role === 'pro') return;
        setError(null);
      } catch { if (!cancelled) setError('No se pudo consultar tu perfil. Puedes volver a comprobarlo.'); }
      if (cancelled) return;
      tries += 1;
      if (tries >= 20) { setWaiting(false); return; }
      timer = window.setTimeout(() => void poll(), 1500);
    }
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [refreshProfile, isPro, attempt]);
  return <section className="mx-auto max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center">
    {isPro ? <CheckCircle className="mx-auto size-12 text-emerald-400" aria-hidden="true" /> : <LoaderCircle className={`mx-auto size-12 text-emerald-400 ${waiting ? 'animate-spin' : ''}`} aria-hidden="true" />}
    <h1 className="mt-5 text-2xl font-semibold">{isPro ? 'Tu plan Pro está activo' : 'Estamos comprobando tu suscripción'}</h1>
    <p role="status" className="mt-3 text-sm leading-6 text-zinc-400">{isPro ? 'Ya puedes disfrutar de toda la academia y de recargas ilimitadas de 10.000 $ ficticios.' : waiting ? 'Esperamos la confirmación de Stripe. Esta comprobación puede tardar unos segundos.' : 'La confirmación sigue pendiente. Puedes volver al Dashboard y comprobarlo más tarde; no necesitas repetir el pago.'}</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    {!isPro && !waiting && <button type="button" onClick={() => { setWaiting(true); setError(null); setAttempt((value) => value + 1); }} className="mt-5 text-sm text-emerald-300 underline">Comprobar de nuevo</button>}
    <Link to="/dashboard" className="mt-6 block rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-emerald-300">Volver al Dashboard</Link>
  </section>;
}
