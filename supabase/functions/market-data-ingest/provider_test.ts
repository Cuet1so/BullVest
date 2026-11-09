import { parseTwelveDataCandles } from './provider.ts';

const body = {
  meta: { symbol: 'TTD', interval: '1min' },
  values: [
    { datetime: '2026-11-06 20:59:00', open: '13.00', high: '13.02', low: '12.98', close: '13.01' },
    { datetime: '2026-11-06 20:58:00', open: '13.00', high: '13.04', low: '12.94', close: '13.00' },
  ],
};

Deno.test('valid TTD candles preserve real UTC market timestamps and OHLC', () => {
  const result = parseTwelveDataCandles(body, 'TTD');
  if (!result.ok) throw new Error(result.code);
  if (result.candles.length !== 2) throw new Error('Expected two candles');
  if (result.candles[0].open_at !== '2026-11-06T20:58:00.000Z') {
    throw new Error('Timestamp shifted or replaced by fetch time');
  }
  if (result.candles[1].close !== 13.01) throw new Error('Wrong close');
});

Deno.test('reject mismatched symbols before storing any prices', () => {
  const result = parseTwelveDataCandles(body, 'AAPL');
  if (result.ok || result.code !== 'SYMBOL_MISMATCH') throw new Error('Must reject mismatched symbols');
});

Deno.test('discard invalid OHLC and impossible values', () => {
  const result = parseTwelveDataCandles({
    meta: { symbol: 'TTD' },
    values: [
      { datetime: '2026-11-06 20:58:00', open: '13', high: '12', low: '11', close: '13' },
      { datetime: '2026-11-06 20:59:00', open: 'Infinity', high: '13', low: '12', close: '13' },
    ],
  }, 'TTD');
  if (result.ok || result.code !== 'NO_VALID_CANDLES') throw new Error('Expected invalid bars');
});

Deno.test('UTC parser rejects impossible calendar dates', () => {
  const result = parseTwelveDataCandles({
    meta: { symbol: 'TTD' },
    values: [
      { datetime: '2026-02-31 20:59:00', open: '13', high: '14', low: '12', close: '13' },
    ],
  }, 'TTD');
  if (result.ok) throw new Error('Cannot accept invalid timestamp');
});
