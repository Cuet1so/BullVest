import { Check, Crown } from 'lucide-react';
import { SubscriptionActions } from '../../subscription/components/SubscriptionActions';
import { AcademyDialog } from './AcademyDialog';

export function UpgradePaywallModal({ onClose }: { onClose: () => void }) {
  return (
    <AcademyDialog title="Lleva tu aprendizaje al siguiente nivel" onClose={onClose}>
      <div className="mx-auto max-w-lg text-center">
        <span className="inline-flex rounded-2xl bg-amber-400/10 p-4"><Crown className="size-8 text-amber-300" aria-hidden="true" /></span>
        <p className="mt-5 text-xl font-semibold">Desbloquea la academia Pro</p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">El Nivel 1 es gratuito. Con Pro accedes a los niveles 2 al 5 para profundizar en análisis y gestión del riesgo.</p>
        <ul className="my-6 space-y-3 text-left text-sm text-zinc-300">{['12 lecciones adicionales con sus cuestionarios', 'Screening, moats, análisis técnico y gestión del riesgo', 'Recargas de capital ficticio ilimitadas'].map((benefit) => <li key={benefit} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden="true" />{benefit}</li>)}</ul>
        <SubscriptionActions />
        <p className="mt-3 text-xs text-zinc-500">Suscripción de pago. Consulta el precio y la periodicidad en Stripe antes de confirmar.</p>
        <button type="button" onClick={onClose} className="mt-5 text-sm text-zinc-400 underline">Seguir aprendiendo gratis</button>
      </div>
    </AcademyDialog>
  );
}
