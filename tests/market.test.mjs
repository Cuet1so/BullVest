import assert from 'node:assert/strict';
import test from 'node:test';
import { canQuoteTrade, categoryLabel, filterMarketAssets, formatChange, formatPrice, getOrderPrice, getSignal, MARKET_FILTERS } from '../src/features/trading/utils/market.ts';
import { executionPrice } from '../supabase/functions/trading/quote.ts';

const now = Date.now();
const asset = (ticker, overrides = {}) => ({ id: ticker, ticker, name: ticker, category: 'stocks', current_price: 100, sell_price: 99,
  change_24h: 0, change_30d: 0, volatility_1d: 0, is_popular: false, is_meme: false, has_options: false, signal_type: 'NEUTRAL',
  is_tradable: true, currency: 'USD', price_updated_at: new Date(now).toISOString(), ...overrides });
const assets = [
  asset('AAPL', { name: 'Apple', is_popular: true, has_options: true, change_24h: 2, change_30d: 8, volatility_1d: 3, signal_type: 'COMPRAR' }),
  asset('BTC', { name: 'Bitcoin', category: 'crypto', is_popular: true, change_24h: -3, change_30d: -12, volatility_1d: 7, signal_type: 'VENTA FUERTE' }),
  asset('DOGE', { category: 'crypto', is_meme: true, change_24h: 9, change_30d: 20, volatility_1d: 12, signal_type: 'COMPRA FUERTE' }),
  asset('GOLD', { category: 'commodities', change_24h: -1, change_30d: -4, volatility_1d: 2 }),
  asset('INDEX', { category: 'indices', change_24h: 1, change_30d: 2, volatility_1d: 1 }),
  asset('EURUSD', { category: 'forex', change_24h: -2, change_30d: 0, volatility_1d: 4 }),
  asset('NULL', { category: null, change_24h: null, change_30d: null, volatility_1d: null, signal_type: null }),
];
const tickers = (filter, search = '') => filterMarketAssets(assets, filter, search).map((item) => item.ticker);

test('all fourteen market categories and rankings apply the requested rules', () => {
  assert.equal(MARKET_FILTERS.length, 14);
  for (const [filter, expected] of Object.entries({ popular: ['AAPL', 'BTC'], stocks: ['AAPL'], crypto: ['BTC', 'DOGE'],
    meme: ['DOGE'], commodities: ['GOLD'], indices: ['INDEX'], forex: ['EURUSD'], options: ['AAPL'],
    signals: ['AAPL', 'BTC', 'DOGE'], gainers: ['DOGE', 'AAPL', 'INDEX', 'GOLD', 'EURUSD', 'BTC', 'NULL'],
    losers: ['BTC', 'EURUSD', 'GOLD', 'INDEX', 'AAPL', 'DOGE', 'NULL'],
    volatile: ['DOGE', 'BTC', 'EURUSD', 'AAPL', 'GOLD', 'INDEX', 'NULL'],
    up30d: ['DOGE', 'AAPL', 'INDEX'], down30d: ['BTC', 'GOLD'] })) assert.deepEqual(tickers(filter), expected, filter);
  assert.deepEqual(assets.map((item) => item.ticker), ['AAPL', 'BTC', 'DOGE', 'GOLD', 'INDEX', 'EURUSD', 'NULL']);
});

test('search spans the full catalog independently of tabs, case and accents', () => {
  assert.deepEqual(tickers('stocks', ' bITCoin '), ['BTC']);
  assert.deepEqual(tickers('gainers', 'gold'), ['GOLD']);
  assert.deepEqual(filterMarketAssets([asset('ABC', { name: 'Índice europeo' })], 'meme', 'indice').map((item) => item.ticker), ['ABC']);
  assert.deepEqual(tickers('popular', 'nonexistent'), []);
});

test('signals, null metrics and very small prices are displayed without fabricated data', () => {
  assert.equal(getSignal(null), null);
  assert.equal(getSignal(' neutral '), null);
  assert.deepEqual(getSignal('STRONG_BUY'), { label: 'COMPRA FUERTE', direction: 'buy' });
  assert.deepEqual(getSignal('VENTA'), { label: 'VENDER', direction: 'sell' });
  assert.equal(getSignal('UNKNOWN').direction, 'neutral');
  assert.equal(categoryLabel(null), 'Sin categoría');
  assert.equal(formatChange(null), '—');
  assert.equal(formatChange(2.3), '+2,30 %');
  assert.equal(formatChange(-2.3), '-2,30 %');
  assert.equal(formatPrice(0.0000018), '0,0000018 USD');
  assert.equal(formatPrice(null), '—');
});

test('frontend and Edge use the same side price and reject absent or crossed bids', () => {
  for (const item of [asset('OK'), asset('TINY', { current_price: 0.000002, sell_price: 0.0000018 }),
    asset('NULL', { sell_price: null }), asset('ZERO', { sell_price: 0 }), asset('CROSS', { sell_price: 101 })]) {
    for (const side of ['BUY', 'SELL']) assert.equal(getOrderPrice(item, side), executionPrice(item, side));
  }
  assert.equal(getOrderPrice(asset('A'), 'SELL'), 99);
  assert.equal(canQuoteTrade(asset('A'), 'BUY', now), true);
  assert.equal(canQuoteTrade(asset('A', { is_tradable: false }), 'BUY', now), false);
  assert.equal(canQuoteTrade(asset('A', { currency: 'EUR' }), 'BUY', now), false);
  assert.equal(canQuoteTrade(asset('A', { price_updated_at: new Date(now - 121000).toISOString() }), 'BUY', now), false);
  assert.equal(canQuoteTrade(asset('A', { price_updated_at: new Date(now + 6000).toISOString() }), 'BUY', now), false);
});
