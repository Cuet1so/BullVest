import assert from 'node:assert/strict';
import test from 'node:test';
import { marginValue, riskAmount, MULTIPLIERS } from '../src/features/trading/utils/margin.ts';
import { spreadPercentage } from '../src/features/trading/utils/market.ts';
import { buildDashboardSummary } from '../src/features/dashboard/utils/dashboardSummary.ts';

test('margin uses exit-side prices, caps losses and rejects invalid quotes', () => {
  const position = { investment: 100, quantity: 10, entry_price: 100, side: 'BUY' };
  assert.deepEqual(marginValue(position, 100, 99), { equity: 90, pnl: -10 });
  assert.deepEqual(marginValue(position, 110, 109), { equity: 190, pnl: 90 });
  assert.deepEqual(marginValue({ ...position, side: 'SELL' }, 110, 109), { equity: 0, pnl: -100 });
  assert.deepEqual(marginValue(position, 10, 9), { equity: 0, pnl: -100 });
  for (const bid of [null, 0, -1, Infinity, NaN, 101]) assert.equal(marginValue(position, 100, bid), null);
  assert.equal(spreadPercentage(100, 99), 1);
  assert.equal(spreadPercentage(100, 101), null);
});

test('TP/SL percentages are based on reserved investment, not exposure', () => {
  assert.deepEqual(MULTIPLIERS, [1, 2, 5, 10, 20, 50, 100]);
  assert.equal(riskAmount('25', '%', 200), 50);
  assert.equal(riskAmount('25', 'USD', 200), 25);
  for (const value of ['-1', '', 'NaN', 'Infinity', '1.234']) assert.equal(riskAmount(value, '%', 100), null);
});

test('dashboard includes net margin equity, including fully depleted margin', () => {
  const holding = { assetId: 'margin', ticker: 'DEMO', name: 'Demo', quantity: 1, averageBuyPrice: 100,
    currentPrice: 90, sellPrice: 90, quotedAt: new Date().toISOString(), isSimulated: true, valuation: 'margin' };
  assert.equal(buildDashboardSummary(9900, [holding]).netWorth, 9990);
  const lost = buildDashboardSummary(9900, [{ ...holding, currentPrice: 0, sellPrice: 0 }]);
  assert.equal(lost.netWorth, 9900);
  assert.equal(lost.bidNetWorth, 9900);
  assert.equal(lost.bidUnrealizedPnl, -100);
});
