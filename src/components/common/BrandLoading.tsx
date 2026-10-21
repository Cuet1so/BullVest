import { Logo } from './Logo';
import { Skeleton } from '../ui/Skeleton';

export function BrandLoading({ message = 'Comprobando sesión…' }: { message?: string }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 p-6 text-zinc-300">
    <Logo size="lg" />
    <div role="status" aria-live="polite" className="space-y-4 text-center text-sm">
      <Skeleton width={192} height={4} className="mx-auto bg-emerald-400/20" />
      <p>{message}</p>
    </div>
  </div>;
}
