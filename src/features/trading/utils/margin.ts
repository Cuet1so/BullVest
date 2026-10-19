export const MULTIPLIERS = [1, 2, 5, 10, 20, 50, 100] as const;
export function marginValue(position: { investment: number; quantity: number; entry_price: number; side: string }, ask: number | null, bid: number | null) {
  if (ask === null || bid === null || !Number.isFinite(ask) || !Number.isFinite(bid) || ask <= 0 || bid <= 0 || bid > ask) return null;
  const pnl = ((position.side === 'BUY' ? bid - position.entry_price : position.entry_price - ask) * position.quantity);
  return { pnl: Math.max(-position.investment, pnl), equity: Math.max(0, position.investment + pnl) };
}
export function riskAmount(value: string, unit: 'USD' | '%', investment: number): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = unit === '%' ? investment * Number(value) / 100 : Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000 ? Math.round(amount * 100) / 100 : null;
}
