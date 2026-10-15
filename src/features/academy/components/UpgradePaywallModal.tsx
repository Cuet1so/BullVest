import { useEffect, useState } from 'react';
import { Check, Crown, LoaderCircle } from 'lucide-react';
import { getProUpgradeRequest, requestProUpgrade } from '../../dashboard/services/dashboardService';
import { AcademyDialog } from './AcademyDialog';

export function UpgradePaywallModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'requested'>('loading');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getProUpgradeRequest().then((request) => { if (!cancelled) setStatus(request ? 'requested' : 'idle'); })
      .catch(() => { if (!cancelled) { setStatus('idle'); setError('No se pudo consultar tu solicitud anterior. Puedes volver a solicitar Pro.'); } });
    return () => { cancelled = true; };
  }, []);
  async function requestUpgrade() {
    setStatus('saving'); setError(null);
    try { await requestProUpgrade(); setStatus('requested'); }
    catch (failure) { setStatus('idle'); setError(failure instanceof Error ? failure.message : 'No se pudo registrar la solicitud.'); }
  }
  return (
    <AcademyDialog title="Lleva tu aprendizaje al siguiente nivel" onClose={onClose}>
      <div className="mx-auto max-w-lg text-center">
        <span className="inline-flex rounded-2xl bg-amber-400/10 p-4"><Crown className="size-8 text-amber-300" aria-hidden="true" /></span>
        <p className="mt-5 text-xl font-semibold">Desbloquea la academia Pro</p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">El Nivel 1 es gratuito. Con Pro accedes a los niveles 2 al 5 para profundizar en análisis y gestión del riesgo.</p>
        <ul className="my-6 space-y-3 text-left text-sm text-zinc-300">{['12 lecciones adicionales con sus cuestionarios', 'Screening, moats, análisis técnico y gestión del riesgo', 'Recargas de capital ficticio ilimitadas'].map((benefit) => <li key={benefit} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden="true" />{benefit}</li>)}</ul>
        <button type="button" onClick={() => void requestUpgrade()} disabled={status !== 'idle'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-60">{(status === 'saving' || status === 'loading') && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{status === 'requested' ? 'Solicitud registrada' : status === 'loading' ? 'Comprobando solicitud…' : status === 'saving' ? 'Registrando…' : 'Solicitar Pro'}</button>
        {status === 'requested' && <p role="status" className="mt-3 text-sm text-emerald-300">Tu solicitud está guardada. El acceso Pro estará disponible cuando se active tu plan.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
        <button type="button" onClick={onClose} className="mt-5 text-sm text-zinc-400 underline">Seguir aprendiendo gratis</button>
      </div>
    </AcademyDialog>
  );
}
