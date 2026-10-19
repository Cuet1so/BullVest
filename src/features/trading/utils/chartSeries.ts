import type { Asset } from '../services/tradingService';

export const CHART_PERIODS = { '1M': 60_000, '5M': 300_000, '15M': 900_000,
  '1H': 3_600_000, '1D': 86_400_000, '1W': 604_800_000 } as const;
export type ChartPeriod = keyof typeof CHART_PERIODS;
export type QuotePoint = { time: number; mid: number; ask: number; bid: number; openingMid: number };
export type QuoteHistory = Record<string, QuotePoint[]>;
export const MAX_QUOTE_POINTS = 2000;

export function appendQuotes(history: QuoteHistory, assets: readonly Asset[]): QuoteHistory {
  let next = history;
  for (const asset of assets) {
    const time = Date.parse(asset.price_updated_at ?? '');
    const ask = asset.current_price;
    const bid = asset.sell_price;
    if (!Number.isFinite(time) || !Number.isFinite(ask) || ask <= 0
      || bid === null || !Number.isFinite(bid) || bid <= 0 || bid > ask) continue;
    const points = next[asset.id] ?? [];
    const last = points.at(-1);
    if (last && (time < last.time || (time === last.time && ask === last.ask && bid === last.bid))) continue;
    const mid = (ask + bid) / 2;
    const point = { time, mid, ask, bid, openingMid: last?.openingMid ?? mid };
    const updated = last?.time === time ? [...points.slice(0, -1), point] : [...points, point];
    if (next === history) next = { ...history };
    next[asset.id] = updated.slice(-MAX_QUOTE_POINTS);
  }
  return next;
}

// Periods are visible time windows, not fabricated historical candles. Bound the
// rendered series to ~240 points using the last observed tick in each bucket.
export function chartWindow(points: readonly QuotePoint[], period: ChartPeriod, now: number): QuotePoint[] {
  const duration = CHART_PERIODS[period];
  const bucketSize = Math.max(1000, duration / 240);
  const buckets = new Map<number, QuotePoint>();
  for (const point of points) {
    if (point.time < now - duration || point.time > now + 5000) continue;
    buckets.set(Math.floor(point.time / bucketSize), point);
  }
  return [...buckets.values()];
}
