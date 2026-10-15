export function executionPrice(
  quote: { current_price: unknown; sell_price: unknown },
  side: 'BUY' | 'SELL',
): number | null {
  const raw = side === 'BUY' ? quote.current_price : quote.sell_price;
  if (raw === null || raw === undefined) return null;
  const price = Number(raw);
  const ask = Number(quote.current_price);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (side === 'SELL' && (!Number.isFinite(ask) || price > ask)) return null;
  return price;
}
