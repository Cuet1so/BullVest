export function bidPositionValue(quantity: number, ask: number, bid: number | null): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(ask) || ask <= 0
    || bid === null || !Number.isFinite(bid) || bid <= 0 || bid > ask) return null;
  return quantity * bid;
}
