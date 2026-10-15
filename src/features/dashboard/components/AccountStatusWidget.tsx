import { useEffect, useState } from 'react';
import { Check, Crown, Heart, Infinity as InfinityIcon, LoaderCircle } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { getProUpgradeRequest, requestProUpgrade } from '../services/dashboardService';

type RequestStatus = 'loading' | 'idle' | 'submitting' | 'requested' | 'error';

export function AccountStatusWidget() {
  const { profile, user } = useAuth();
  const [status, setStatus] = useState<RequestStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const isPro = profile?.role === 'pro';
  const lives = Math.min(3, Math.max(0, profile?.lives_remaining ?? 0));

  useEffect(() => {
    if (!user || isPro) return;
    let cancelled = false;
    void getProUpgradeRequest().then((request) => {
      if (!cancelled) setStatus(request ? 'requested' : 'idle');
    }).catch(() => {
      if (!cancelled) {
        setStatus('error');
        setError('No se pudo comprobar si ya solicitaste Pro. Puedes reintentarlo.');
      }
    });
    return () => { cancelled = true; };
  }, [user, isPro]);

  async function submitRequest() {
    setStatus('submitting');
    setError(null);
    try {
      await requestProUpgrade();
      setStatus('requested');
    } catch (requestError) {
      setStatus('error');
      setError(requestError instanceof Error ? requestError.message : 'No se pudo solicitar Pro.');
    }
  }

  if (!profile) return <p role="status" className="rounded-2xl border border-zinc-800 p-6">Cargando tu cuenta…</p>;

  return (
    <section aria-labelledby="account-status-title" className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
      <div className="flex items-center justify-between gap-3"><h2 id="account-status-title" className="text-sm font-medium text-zinc-400">Tu cuenta</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${isPro ? 'bg-amber-400/10 text-amber-300' : 'border border-zinc-700 text-zinc-300'}`}>{isPro ? 'Pro' : 'Free'}</span></div>
      <div className="mt-5 flex items-center gap-3"><span className="rounded-xl bg-emerald-400/10 p-3"><Crown className="size-6 text-emerald-300" aria-hidden="true" /></span><div><p className="text-xl font-semibold">{isPro ? 'Sin límites para aprender' : 'Cada decisión cuenta'}</p><p className="mt-1 text-xs text-zinc-400">Tu espacio para practicar e invertir.</p></div></div>
      <div className="my-6 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="flex items-center justify-between gap-2"><span className="text-sm text-zinc-400">Vidas disponibles</span><span className="text-sm font-semibold">{isPro ? 'Ilimitadas' : `${lives} de 3`}</span></div>
        <div className="mt-3 flex gap-2" aria-hidden="true">{isPro ? <InfinityIcon className="size-6 text-emerald-300" /> : Array.from({ length: 3 }, (_, index) => <Heart key={index} className={`size-6 ${index < lives ? 'fill-rose-400 text-rose-400' : 'text-zinc-700'}`} />)}</div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">Recarga tu capital ficticio desde el simulador cuando cumplas las condiciones.</p>
      </div>
      {isPro ? <p className="mt-auto flex items-center gap-2 text-sm text-emerald-300"><Check className="size-4" aria-hidden="true" /> Tu plan Pro está activo.</p> : (
        <div className="mt-auto">
          <p className="mb-3 text-sm text-zinc-300">Sigue practicando con recargas ilimitadas en Pro.</p>
          <button type="button" onClick={() => void submitRequest()} disabled={status === 'loading' || status === 'submitting' || status === 'requested'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-default disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">
            {status === 'loading' || status === 'submitting' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : status === 'requested' ? <Check className="size-4" aria-hidden="true" /> : <Crown className="size-4" aria-hidden="true" />}
            {status === 'requested' ? 'Solicitud registrada' : status === 'loading' ? 'Comprobando solicitud…' : status === 'submitting' ? 'Registrando…' : 'Solicitar Upgrade a Pro'}
          </button>
          {status === 'requested' && <p role="status" className="mt-2 text-xs text-emerald-300">Tu interés en Pro está registrado. Tu plan actual sigue siendo Free.</p>}
          {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
      )}
    </section>
  );
}
