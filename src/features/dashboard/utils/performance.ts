export type PerformancePeriod = 'week' | 'month' | 'all';
export interface PerformancePoint {
  observed_at: string;
  equity: number;
  return_pct: number | null;
  is_daily_close: boolean;
  quotes_fresh: boolean;
}
export interface EquityPoint { date: string; equity: number; observedAt: string; returnIndex: number | null }

export function calculatePerformance(points: PerformancePoint[]) {
  const ordered = [...points].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  if (ordered.some((p) => !Number.isFinite(p.equity) || !Number.isFinite(Date.parse(p.observed_at)))) throw new Error('El historial de patrimonio contiene datos no válidos.');
  let index = 100;
  let peak = 100;
  let maxDrawdown = 0;
  let complete = true;
  const dailyReturns: number[] = [];
  const curve = new Map<string, EquityPoint>();
  ordered.forEach((point, position) => {
    if (position > 0) {
      if (point.return_pct === null || !Number.isFinite(point.return_pct) || point.return_pct < -100) complete = false;
      else {
        index *= 1 + point.return_pct / 100;
        peak = Math.max(peak, index);
        maxDrawdown = Math.max(maxDrawdown, (peak - index) / peak * 100);
        if (point.is_daily_close && point.quotes_fresh && ordered[position - 1].quotes_fresh) dailyReturns.push(point.return_pct / 100);
      }
    }
    const date = new Date(point.observed_at).toISOString().slice(0, 10);
    curve.set(date, { date, equity: point.equity, observedAt: point.observed_at, returnIndex: complete ? index : null });
  });
  let sharpe: number | null = null;
  if (dailyReturns.length >= 2) {
    const average = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + (r - average) ** 2, 0) / (dailyReturns.length - 1);
    // Calendario del simulador (incluye cripto), tasa libre de riesgo asumida 0.
    if (variance > 1e-16) sharpe = average / Math.sqrt(variance) * Math.sqrt(365);
  }
  return { curve: [...curve.values()], maxDrawdown: ordered.length >= 2 && complete ? maxDrawdown : null,
    sharpe, dailyReturnCount: dailyReturns.length, since: ordered[0]?.observed_at ?? null,
    hasStaleQuotes: ordered.some((point) => !point.quotes_fresh), hasGaps: !complete };
}
export const PERFORMANCE_PERIODS: { id: PerformancePeriod; label: string }[] = [
  { id: 'week', label: 'Semanal' }, { id: 'month', label: 'Mensual' }, { id: 'all', label: 'Histórico' },
];
