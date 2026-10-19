import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardSummary } from '../src/features/dashboard/utils/dashboardSummary.ts';

const now = Date.parse('2026-10-15T12:00:00Z');
const holding = {
  assetId: 'asset-1', ticker: 'TEST', name: 'Test', quantity: 2,
  averageBuyPrice: 15, currentPrice: 20, sellPrice: 19, quotedAt: new Date(now).toISOString(), isSimulated: true,
};

test('an empty portfolio is 100% cash, including an exhausted balance', () => {
  for (const cash of [0, 50_000]) {
    const summary = buildDashboardSummary(cash, [], now);
    assert.equal(summary.netWorth, cash);
    assert.equal(summary.investedValue, 0);
    assert.equal(summary.liquidityPercentage, 100);
    assert.equal(summary.unrealizedPnlPercentage, null);
  }
});

test('net worth, unrealized performance and allocation include all holdings', () => {
  const summary = buildDashboardSummary(60, [holding], now);
  assert.equal(summary.netWorth, 100);
  assert.equal(summary.investedValue, 40);
  assert.equal(summary.costBasis, 30);
  assert.equal(summary.unrealizedPnl, 10);
  assert.equal(summary.liquidityPercentage, 60);
  assert.equal(summary.holdings[0].percentage, 40);
  assert.equal(summary.hasStaleQuotes, false);
});

test('fractional holdings and losses are preserved before formatting', () => {
  const summary = buildDashboardSummary(0, [{ ...holding, quantity: 0.125, currentPrice: 10 }], now);
  assert.equal(summary.netWorth, 1.25);
  assert.equal(summary.unrealizedPnl, -0.625);
  assert.equal(summary.holdings[0].percentage, 100);
  assert.equal(summary.liquidityPercentage, 0);
});

test('missing, old and future timestamps mark quotes as stale', () => {
  for (const quotedAt of [null, 'invalid', new Date(now - 121_000).toISOString(), new Date(now + 6_000).toISOString()]) {
    assert.equal(buildDashboardSummary(0, [{ ...holding, quotedAt }], now).hasStaleQuotes, true);
  }
});

test('invalid prices fail instead of silently understating net worth', () => {
  for (const currentPrice of [0, -1, NaN, Infinity]) {
    assert.throws(() => buildDashboardSummary(0, [{ ...holding, currentPrice }], now));
  }
  assert.throws(() => buildDashboardSummary(NaN, [], now));
});

test('Ask valuation and Bid liquidation account for spread and actual cost', () => {
  const summary = buildDashboardSummary(60, [{ ...holding, averageBuyPrice: 20 }], now);
  assert.equal(summary.netWorth, 100);
  assert.equal(summary.unrealizedPnl, 0);
  assert.equal(summary.bidNetWorth, 98);
  assert.equal(summary.bidInvestedValue, 38);
  assert.equal(summary.bidUnrealizedPnl, -2);
  assert.equal(summary.bidUnrealizedPnlPercentage, -5);
  assert.equal(summary.holdings[0].bidValue, 38);
});

test('missing, invalid and crossed bids never fall back to Ask or zero', () => {
  for (const sellPrice of [null, undefined, 0, -1, NaN, Infinity, 21]) {
    const summary = buildDashboardSummary(60, [holding, { ...holding, sellPrice }], now);
    assert.equal(summary.netWorth, 140);
    assert.equal(summary.bidNetWorth, null);
    assert.equal(summary.bidUnrealizedPnl, null);
  }
  const cash = buildDashboardSummary(60, [], now);
  assert.equal(cash.bidNetWorth, 60);
  assert.equal(cash.bidUnrealizedPnl, 0);
  assert.equal(cash.bidUnrealizedPnlPercentage, null);
});
