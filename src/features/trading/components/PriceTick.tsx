import { useEffect, useRef } from 'react';
import { formatPrice } from '../utils/market';

export function PriceTick({ price, currency = 'USD', className = '' }: {
  price: number | null; currency?: string; className?: string;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const previous = useRef(price);
  useEffect(() => {
    const last = previous.current;
    previous.current = price;
    if (price === null || last === null || price === last || !Number.isFinite(price) || !Number.isFinite(last)
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = element.current?.animate([
      { backgroundColor: price > last ? 'rgb(52 211 153 / 0.25)' : 'rgb(251 113 133 / 0.25)' },
      { backgroundColor: 'transparent' },
    ], { duration: 500, easing: 'ease-out' });
    return () => animation?.cancel();
  }, [price]);
  return <span ref={element} className={`rounded px-1 tabular-nums ${className}`}>{formatPrice(price, currency)}</span>;
}
