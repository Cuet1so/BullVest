import { Heart } from 'lucide-react';
import { AcademyDialog } from '../../academy/components/AcademyDialog';
import { SubscriptionActions } from './SubscriptionActions';

export function OutOfLivesModal({ onClose }: { onClose: () => void }) {
  return <AcademyDialog title="Has agotado tus tres vidas" onClose={onClose}>
    <div className="mx-auto max-w-md space-y-5 text-center">
      <Heart className="mx-auto size-10 text-rose-400" aria-hidden="true" />
      <p className="text-zinc-300">Tu plan Free ya no dispone de recargas. Con BullVest Pro puedes restablecer tu saldo ficticio a 10.000 $ tantas veces como necesites y acceder a toda la academia.</p>
      <SubscriptionActions />
      <p className="text-xs text-zinc-500">Pro es una suscripción de pago. Stripe mostrará el precio y la periodicidad antes de confirmar.</p>
      <button type="button" onClick={onClose} className="text-sm text-zinc-400 underline">Volver al simulador</button>
    </div>
  </AcademyDialog>;
}
