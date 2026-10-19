import type { Asset, OrderType } from '../services/tradingService';

export const MARKET_FILTERS = [
  { id: 'popular', label: 'Populares' },
  { id: 'stocks', label: 'Acciones' },
  { id: 'crypto', label: 'Criptodivisas' },
  { id: 'meme', label: 'Monedas Meme' },
  { id: 'commodities', label: 'Productos / Materias Primas' },
  { id: 'indices', label: 'Índices' },
  { id: 'forex', label: 'Monedas / Forex' },
  { id: 'options', label: 'Opciones, Sin Comisiones' },
  { id: 'signals', label: 'Señales' },
  { id: 'gainers', label: 'Principales al alza' },
  { id: 'losers', label: 'Los que más han perdido' },
  { id: 'volatile', label: 'Mayor volatilidad (1 día)' },
  { id: 'up30d', label: 'Tendencia al alza 30d' },
  { id: 'down30d', label: 'Tendencia a la baja 30d' },
] as const;

export type MarketFilter = typeof MARKET_FILTERS[number]['id'];
type Metric = 'change_24h' | 'change_30d' | 'volatility_1d';

export function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function spreadPercentage(ask: number | null, bid: number | null): number | null {
  return finiteNumber(ask) && finiteNumber(bid) && ask > 0 && bid > 0 && bid <= ask
    ? ((ask - bid) / ask) * 100 : null;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}

export function getSignal(signal: string | null | undefined) {
  const value = signal?.trim().toUpperCase().replaceAll('_', ' ');
  if (!value || value === 'NEUTRAL') return null;
  const signals: Record<string, { label: string; direction: 'buy' | 'sell' }> = {
    'STRONG BUY': { label: 'COMPRA FUERTE', direction: 'buy' },
    'COMPRA FUERTE': { label: 'COMPRA FUERTE', direction: 'buy' },
    BUY: { label: 'COMPRAR', direction: 'buy' },
    COMPRAR: { label: 'COMPRAR', direction: 'buy' },
    COMPRA: { label: 'COMPRAR', direction: 'buy' },
    'STRONG SELL': { label: 'VENTA FUERTE', direction: 'sell' },
    'VENTA FUERTE': { label: 'VENTA FUERTE', direction: 'sell' },
    SELL: { label: 'VENDER', direction: 'sell' },
    VENTA: { label: 'VENDER', direction: 'sell' },
    VENDER: { label: 'VENDER', direction: 'sell' },
  };
  return signals[value] ?? { label: value, direction: 'neutral' as const };
}

export function filterMarketAssets(assets: readonly Asset[], filter: MarketFilter, search: string): Asset[] {
  const query = normalize(search);
  // La búsqueda es global, incluso si el activo no pertenece a la pestaña elegida.
  const filtered = assets.filter((asset) => {
    if (query) return normalize(`${asset.ticker} ${asset.name}`).includes(query);
    switch (filter) {
      case 'popular': return asset.is_popular === true;
      case 'meme': return asset.is_meme === true;
      case 'options': return asset.has_options === true;
      case 'signals': return getSignal(asset.signal_type) !== null;
      case 'up30d': return finiteNumber(asset.change_30d) && asset.change_30d > 0;
      case 'down30d': return finiteNumber(asset.change_30d) && asset.change_30d < 0;
      case 'stocks': case 'crypto': case 'commodities': case 'indices': case 'forex':
        return asset.category === filter;
      default: return true;
    }
  });
  const metric: Metric | null = query ? null
    : filter === 'gainers' || filter === 'losers' ? 'change_24h'
    : filter === 'volatile' ? 'volatility_1d'
    : filter === 'up30d' || filter === 'down30d' ? 'change_30d' : null;
  const direction = filter === 'losers' || filter === 'down30d' ? 1 : -1;
  return filtered.sort((a, b) => {
    if (metric) {
      const av = a[metric]; const bv = b[metric];
      if (!finiteNumber(av) && finiteNumber(bv)) return 1;
      if (finiteNumber(av) && !finiteNumber(bv)) return -1;
      if (finiteNumber(av) && finiteNumber(bv) && av !== bv) return (av - bv) * direction;
    }
    return a.ticker.localeCompare(b.ticker) || a.id.localeCompare(b.id);
  });
}

export function getOrderPrice(asset: Asset | null, side: OrderType): number | null {
  if (!asset) return null;
  const price = side === 'BUY' ? asset.current_price : asset.sell_price;
  if (!finiteNumber(price) || price <= 0) return null;
  // Un bid ausente o cruzado no se sustituye por el precio de compra.
  if (side === 'SELL' && (!finiteNumber(asset.current_price) || price > asset.current_price)) return null;
  return price;
}

export function isQuoteRecent(asset: Asset, now: number): boolean {
  const timestamp = asset.price_updated_at ? Date.parse(asset.price_updated_at) : Number.NaN;
  return Number.isFinite(timestamp) && now - timestamp <= 120_000 && timestamp - now <= 5_000;
}

export function canQuoteTrade(asset: Asset, side: OrderType, now: number): boolean {
  return asset.is_tradable && asset.currency === 'USD' && getOrderPrice(asset, side) !== null && isQuoteRecent(asset, now);
}

export function formatPrice(price: number | null | undefined, currency = 'USD'): string {
  if (!finiteNumber(price) || price <= 0) return '—';
  const decimals = price < 1 ? 8 : price < 10 ? 5 : 2;
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: decimals }).format(price)} ${currency}`;
}

export function formatChange(value: number | null | undefined): string {
  return finiteNumber(value)
    ? `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(value)} %`
    : '—';
}

export function categoryLabel(category: string | null): string {
  const labels: Record<string, string> = { stocks: 'Acciones', crypto: 'Cripto', commodities: 'Materias primas', indices: 'Índices', forex: 'Forex' };
  return category ? labels[category] ?? category : 'Sin categoría';
}
