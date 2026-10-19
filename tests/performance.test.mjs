import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePerformance } from '../src/features/dashboard/utils/performance.ts';
const point = (day, equity, return_pct, extra = {}) => ({ observed_at: `2026-10-${String(day).padStart(2, '0')}T23:55:00Z`, equity, return_pct, is_daily_close: true, quotes_fresh: true, ...extra });

test('drawdown follows the cash-flow adjusted index, not raw deposits', () => {
  const result = calculatePerformance([point(1, 1000, null), point(2, 1100, 10), point(3, 10990, -10), point(4, 12089, 10)]);
  assert.ok(Math.abs(result.maxDrawdown - 10) < 1e-9);
  assert.equal(result.curve.at(-1).equity, 12089);
  assert.ok(Math.abs(result.curve.at(-1).returnIndex - 108.9) < 1e-9);
  // Returns [0.1, -0.1, 0.1], sample SD sqrt(0.0133333), annualized sqrt(365).
  assert.ok(Math.abs(result.sharpe - (1 / 30) / Math.sqrt(1 / 75) * Math.sqrt(365)) < 1e-9);
});
test('insufficient history, invalid intervals and zero variance are not fabricated', () => {
  assert.equal(calculatePerformance([]).sharpe, null);
  assert.equal(calculatePerformance([point(1, 1000, null)]).maxDrawdown, null);
  const flat = calculatePerformance([point(1, 1000, null), point(2, 10000, 0), point(3, 10000, 0)]);
  assert.equal(flat.maxDrawdown, 0); assert.equal(flat.sharpe, null);
  const missing = calculatePerformance([point(1, 0, null), point(2, 10000, null)]);
  assert.equal(missing.maxDrawdown, null); assert.equal(missing.hasGaps, true);
});
test('Sharpe excludes live, stale and nonconsecutive daily returns', () => {
  const result = calculatePerformance([point(1, 1000, null), point(2, 900, -10, { quotes_fresh: false }), point(3, 990, 10), point(5, 1000, 1, { is_daily_close: false }), point(6, 1100, 10, { is_daily_close: false })]);
  assert.equal(result.dailyReturnCount, 0); assert.equal(result.sharpe, null); assert.equal(result.hasStaleQuotes, true);
});
test('UTC dates contain the last observed equity, preserving ordered return calculations', () => {
  const result = calculatePerformance([point(2, 1100, 10), point(1, 1000, null), point(2, 1089, -1, { observed_at: '2026-10-02T23:59:00Z', is_daily_close: false })]);
  assert.equal(result.curve.length, 2); assert.equal(result.curve[1].equity, 1089);
  assert.ok(Math.abs(result.maxDrawdown - 1) < 1e-9);
  assert.throws(() => calculatePerformance([point(1, NaN, null)]));
  assert.throws(() => calculatePerformance([point(1, 100, null, { observed_at: 'invalid' })]));
});
