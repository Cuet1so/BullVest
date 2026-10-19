import { useEffect, useState } from 'react';
import { Skeleton } from '../../../components/ui/Skeleton';
import { PriceTick } from './PriceTick';
import { spreadPercentage } from '../utils/market';
import { Bitcoin, Building2, ChartNoAxesCombined, Coins, Globe2, SearchX } from 'lucide-react';
import type { Asset, OrderType } from '../services/tradingService';
import { canQuoteTrade, categoryLabel, finiteNumber, formatChange, getSignal } from '../utils/market';
import type { MarketFilter } from '../utils/market';

export function MarketTable({ assets, selectedId, filter, disabled, onOrder, loading = false }: {
  loading?: boolean;
  assets: Asset[];
  selectedId: string | null;
  filter: MarketFilter | null;
  disabled: boolean;
  onOrder: (asset: Asset, side: OrderType) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const extraMetric = filter === 'volatile' ? 'volatility_1d' : filter === 'up30d' || filter === 'down30d' ? 'change_30d' : null;
  if (!loading && assets.length === 0) return (
    <div className="px-6 py-16 text-center text-zinc-400"><SearchX className="mx-auto mb-3 size-8 text-zinc-600" aria-hidden="true" /><p className="text-sm">No hay activos que coincidan.</p><p className="mt-2 text-xs">Prueba otra categoría o busca en todo el mercado.</p></div>
  );
  return (
    <div className="min-w-0 max-w-full max-h-[620px] overflow-x-auto overflow-y-auto touch-pan-x touch-pan-y touch-pinch-zoom overscroll-x-contain scroll-smooth motion-reduce:scroll-auto [scrollbar-width:thin] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400" tabIndex={0} role="region" aria-label="Tabla de mercado, desplazable" aria-busy={loading}>
      {loading && <p role="status" className="sr-only">Cargando cotizaciones…</p>}
      <table className="w-full min-w-[620px] border-collapse text-sm" aria-label="Cotizaciones del mercado">
        <thead className="sticky top-0 z-10 bg-zinc-900 text-[11px] font-medium uppercase tracking-wide text-zinc-500"><tr>
          <th scope="col" className="px-4 py-4 text-left">Instrumento</th>
          <th scope="col" className="px-3 py-4 text-right">Venta</th>
          <th scope="col" className="px-3 py-4 text-right">Compra</th>
          <th scope="col" className="px-4 py-4 text-right">Variación 24 h</th>
          <th scope="col" className="px-4 py-4 text-right">Spread</th>
          {extraMetric && <th scope="col" className="px-4 py-4 text-right">{extraMetric === 'change_30d' ? 'Variación 30 d' : 'Volatilidad 1 d'}</th>}
        </tr></thead>
        <tbody className="divide-y divide-zinc-800/70">
          {loading ? Array.from({ length: 5 }, (_, index) => <tr key={index} aria-hidden="true">
            <td className="px-4 py-4"><div className="flex items-start gap-3"><Skeleton className="mt-0.5 size-9 shrink-0 rounded-full" /><div className="space-y-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-3 w-28" /><Skeleton className="h-5 w-20" /></div></div></td>
            {[0, 1].map((side) => <td key={side} className="px-3 py-4"><Skeleton className="ml-auto h-4 w-20" /><Skeleton className="mt-2 ml-auto h-9 w-24" /></td>)}
            <td className="px-4 py-4"><Skeleton className="ml-auto h-4 w-16" /></td>
            <td className="px-4 py-4"><Skeleton className="ml-auto h-4 w-16" /></td>
            {extraMetric && <td className="px-4 py-4"><Skeleton className="ml-auto h-4 w-16" /></td>}
          </tr>) : assets.map((asset) => {
            const Icon = asset.category === 'crypto' ? Bitcoin : asset.category === 'commodities' ? Coins : asset.category === 'forex' ? Globe2 : asset.category === 'indices' ? ChartNoAxesCombined : Building2;
            const signal = getSignal(asset.signal_type);
            const buyAvailable = canQuoteTrade(asset, 'BUY', now);
            const sellAvailable = canQuoteTrade(asset, 'SELL', now);
            return (
              <tr key={asset.id} data-ticker={asset.ticker} className={`transition-colors hover:bg-zinc-800/40 ${selectedId === asset.id ? 'bg-emerald-400/5' : ''}`}>
                <th scope="row" className="max-w-64 px-4 py-4 text-left font-normal">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border ${asset.category === 'crypto' ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-zinc-700 bg-zinc-800 text-zinc-300'}`}><Icon className="size-4" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <span className="font-semibold tracking-wide text-zinc-100">{asset.ticker}</span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-400" title={asset.name}>{asset.name}</span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{categoryLabel(asset.category)}</span>
                        {signal && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${signal.direction === 'buy' ? 'bg-emerald-400/10 text-emerald-300' : signal.direction === 'sell' ? 'bg-rose-400/10 text-rose-300' : 'bg-zinc-800 text-zinc-300'}`}>{signal.label}</span>}
                      </div>
                    </div>
                  </div>
                </th>
                {(['SELL', 'BUY'] as const).map((side) => {
                  const available = side === 'BUY' ? buyAvailable : sellAvailable;
                  return <td key={side} className="px-3 py-4 text-right">
                    <PriceTick price={side === 'BUY' ? asset.current_price : asset.sell_price} currency={asset.currency} className="block whitespace-nowrap text-xs font-medium text-zinc-200" />
                    <button type="button" aria-label={`${side === 'BUY' ? 'COMPRAR' : 'VENDER'} ${asset.ticker}`} disabled={disabled || !available}
                      title={!available ? 'Cotización no disponible para operar' : `Preparar ${side === 'BUY' ? 'compra' : 'venta'} de ${asset.ticker}`}
                      onClick={() => onOrder(asset, side)}
                      className={`mt-2 min-w-24 rounded-lg border px-3 py-2 text-[11px] font-bold tracking-wide transition disabled:cursor-not-allowed disabled:opacity-35 ${side === 'BUY' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20' : 'border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20'}`}>
                      {side === 'BUY' ? 'COMPRAR' : 'VENDER'}
                    </button>
                  </td>;
                })}
                <td className="whitespace-nowrap px-4 py-4 text-right"><Change value={asset.change_24h} /></td>
                <td className="whitespace-nowrap px-4 py-4 text-right text-xs tabular-nums text-zinc-400">{spreadPercentage(asset.current_price, asset.sell_price)?.toFixed(4) ?? '—'} %</td>
                {extraMetric && <td className="whitespace-nowrap px-4 py-4 text-right"><Change value={asset[extraMetric]} neutral={extraMetric === 'volatility_1d'} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Change({ value, neutral = false }: { value: number | null; neutral?: boolean }) {
  const tone = !finiteNumber(value) || value === 0 || neutral ? 'text-zinc-400' : value > 0 ? 'text-emerald-300' : 'text-rose-300';
  return <span className={`text-xs font-semibold tabular-nums ${tone}`}>{neutral && finiteNumber(value) ? `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %` : formatChange(value)}</span>;
}
