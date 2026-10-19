import assert from 'node:assert/strict';
import test from 'node:test';
import { appendQuotes, chartWindow, MAX_QUOTE_POINTS } from '../src/features/trading/utils/chartSeries.ts';

const quote = (id, time, ask = 101, bid = 99) => ({ id, current_price: ask, sell_price: bid, price_updated_at: new Date(time).toISOString() });

test('chart history handles duplicate, corrected and out-of-order ticks without mixing assets', () => {
  const original = appendQuotes({}, [quote('A', 1000), quote('B', 1000, 11, 9)]);
  assert.equal(appendQuotes(original, [quote('A', 1000)]), original);
  assert.equal(appendQuotes(original, [quote('A', 500, 200, 199)]), original);
  const corrected = appendQuotes(original, [quote('A', 1000, 103, 101)]);
  assert.equal(corrected.A.length, 1);
  assert.equal(corrected.A[0].mid, 102);
  assert.equal(original.A[0].mid, 100);
  assert.equal(corrected.B, original.B);
  const next = appendQuotes(corrected, [quote('A', 2000, 105, 103)]);
  assert.equal(next.A.length, 2);
  assert.equal(next.A[1].mid, 104);
  for (const invalid of [quote('A', 3000, 0), quote('A', 3000, 1, 2), quote('A', 3000, 1, null),
    { ...quote('A', 3000), price_updated_at: 'invalid' }]) {
    assert.equal(appendQuotes(next, [invalid]), next);
  }
});

test('chart history stays bounded and windows aggregate observed ticks only', () => {
  const quotes = Array.from({ length: MAX_QUOTE_POINTS + 10 }, (_, i) => quote('A', i * 1000));
  const history = appendQuotes({}, quotes);
  assert.equal(history.A.length, MAX_QUOTE_POINTS);
  assert.equal(history.A[0].time, 10_000);
  const shifted = appendQuotes(history, [quote('A', quotes.length * 1000, 201, 199)]);
  assert.equal(shifted.A.at(-1).openingMid, 100);
  const now = quotes.length * 1000;
  const minute = chartWindow(history.A, '1M', now);
  assert.equal(minute.length, 60);
  assert.ok(minute.every((point) => point.time >= now - 60_000));
  const week = chartWindow(history.A, '1W', now);
  assert.ok(week.length < minute.length);
  assert.equal(week.at(-1), history.A.at(-1));
  assert.deepEqual(chartWindow(history.A, '1M', now + 120_000), []);
});
