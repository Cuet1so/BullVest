import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../../features/auth/context/AuthContext';

type LogoProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizes = {
  sm: 'size-16 text-xs',
  md: 'size-24 text-base',
  lg: 'size-48 text-3xl sm:size-56',
};

const imageSizes = {
  sm: '96px',
  md: '144px',
  lg: '(min-width: 640px) 336px, 288px',
};

/** The same image, accessible link and failure treatment on every brand surface. */
export function Logo({ size = 'md', className = '' }: LogoProps) {
  const { user } = useAuth();
  const [failed, setFailed] = useState(false);
  return <Link to={user ? '/dashboard' : '/'}
    aria-label={user ? 'BullVest: ir al Dashboard' : 'BullVest: ir al inicio'}
    className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl align-middle focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 ${sizes[size]} ${className}`}>
    {failed ? <span data-testid="logo-fallback" aria-hidden="true" className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl bg-[#192426]">
      <TrendingUp className="h-1/2 w-1/2 text-emerald-400" strokeWidth={1.8} />
      <span className="font-bold tracking-tight"><span className="text-[#d4b15e]">Bull</span><span className="text-white">Vest</span></span>
    </span> : <img src="/logo.png" alt="BullVest" width={2048} height={2048}
      srcSet="/pwa/icon-192.png 192w, /pwa/icon-512.png 512w" sizes={imageSizes[size]}
      className="h-full w-full scale-150 object-contain" decoding="async" onError={() => setFailed(true)} />}
  </Link>;
}
