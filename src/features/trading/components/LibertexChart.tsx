import { useEffect, useId, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LabelProps } from 'recharts';
import type { Asset } from '../services/tradingService';
import { CHART_PERIODS, chartWindow } from '../utils/chartSeries';
import type { ChartPeriod, QuotePoint } from '../utils/chartSeries';
import { isQuoteRecent, spreadPercentage } from '../utils/market';

const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 8 });
const clock = (time: number, period: ChartPeriod) => new Date(time).toLocaleString('es-ES',
  period === '1D' || period === '1W' ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function SpreadLabel({ viewBox, spread }: LabelProps & { spread: string }) {
  if (!viewBox || !('x' in viewBox) || !('y' in viewBox) || !('width' in viewBox)) return null;
  const x = Number(viewBox.x) + Number(viewBox.width) + 2;
  const y = Number(viewBox.y);
  return <g pointerEvents="none" data-testid="chart-spread-label">
    <rect x={x} y={y - 18} width={91} height={36} rx={5} fill="#202d43" stroke="#64748b" />
    <text x={x + 5} y={y - 4} fill="#94a3b8" fontSize={9}>SPREAD</text>
    <text x={x + 5} y={y + 10} fill="#f8fafc" fontSize={10}>{spread}</text>
  </g>;
}

function QuoteLabel({ viewBox, text, color, offset }: LabelProps & { text: string; color: string; offset: number }) {
  if (!viewBox || !('x' in viewBox) || !('y' in viewBox)) return null;
  return <text x={Number(viewBox.x) + 4} y={Number(viewBox.y) + offset} fill={color} fontSize={10}>{text}</text>;
}

export default function LibertexChart({ asset, ticks, connection }: {
  asset: Asset; ticks: readonly QuotePoint[]; connection: 'connecting' | 'live' | 'fallback';
}) {
  const [period, setPeriod] = useState<ChartPeriod>('5M');
  const [now, setNow] = useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const gradient = `quote-${useId().replaceAll(':', '')}`;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => { window.clearInterval(timer); media.removeEventListener('change', update); };
  }, []);
  const points = useMemo(() => chartWindow(ticks, period, now), [ticks, period, now]);
  const percentage = spreadPercentage(asset.current_price, asset.sell_price);
  const spread = percentage === null ? null : Number((asset.current_price - asset.sell_price!).toFixed(8));
  const fresh = isQuoteRecent(asset, now);
  const first = ticks[0]?.openingMid;
  const last = ticks.at(-1)?.mid;
  const change = first && last ? ((last - first) / first) * 100 : 0;
  const color = change >= 0 ? '#00e6a0' : '#ff496e';
  const domain = useMemo((): [number, number] => {
    const values = points.map((point) => point.mid);
    if (percentage !== null) values.push(asset.current_price, asset.sell_price!);
    if (!values.length) return [0, 1];
    const low = Math.min(...values); const high = Math.max(...values);
    const padding = Math.max((high - low) * 0.25, high * 0.0002, 0.00000001);
    return [Math.max(0, low - padding), high + padding];
  }, [points, asset.current_price, asset.sell_price, percentage]);
  const lastTime = points.at(-1)?.time ?? now;
  const firstTime = points[0]?.time ?? now - CHART_PERIODS[period];
  const xDomain: [number, number] = points.length > 1 ? [firstTime, lastTime]
    : [lastTime - Math.min(CHART_PERIODS[period], 60_000), lastTime + 1000];

  return <section aria-label={`Gráfico de ${asset.ticker}`} className="mb-4 min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-[#121826]" data-testid="libertex-chart" data-points={points.length} data-trend={change >= 0 ? 'up' : 'down'}>
    <header className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-semibold text-white">{asset.ticker} <span className="text-xs font-normal text-slate-400">· {asset.name}</span></h3>
          <p className="mt-1 text-xs" style={{ color }}>{change >= 0 ? '+' : ''}{change.toFixed(3)} % <span className="text-slate-400">desde el primer tick observado</span></p></div>
        <span className={`text-[10px] ${fresh && connection === 'live' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {!fresh ? 'Cotización pendiente de actualizar' : connection === 'live' ? '● En vivo' : connection === 'fallback' ? 'Reconectando · refresco periódico' : 'Conectando…'}
        </span>
      </div>
      <div role="group" aria-label="Temporalidad del gráfico" className="flex gap-1 overflow-x-auto touch-pan-x">
        {(Object.keys(CHART_PERIODS) as ChartPeriod[]).map((value) => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}
          className={`min-h-10 min-w-10 flex-1 rounded-lg px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-emerald-300 ${period === value ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-700/40 hover:text-white'}`}>{value}</button>)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums">
        <span className="text-emerald-300" data-testid="chart-ask">Ask {decimal.format(asset.current_price)} {asset.currency}</span>
        <span className="text-orange-300" data-testid="chart-bid">Bid {asset.sell_price === null ? '—' : decimal.format(asset.sell_price)} {asset.currency}</span>
        <span className="text-slate-300" data-testid="chart-spread">Spread {spread === null ? '—' : `${decimal.format(spread)} ${asset.currency} · ${percentage!.toFixed(6)} %`}</span>
      </div>
    </header>
    <div className="relative h-72 min-w-0 sm:h-80" aria-label="Evolución del precio medio entre Bid y Ask">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={points} margin={{ top: 25, right: 6, left: 8, bottom: 8 }} accessibilityLayer>
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.4} /><stop offset="100%" stopColor={color} stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid stroke="#263244" strokeDasharray="3 5" vertical={false} />
          <XAxis type="number" dataKey="time" domain={xDomain} tickFormatter={(time: number) => clock(time, period)} tick={{ fill: '#94a3b8', fontSize: 10 }} minTickGap={35} tickLine={false} axisLine={false} />
          <YAxis orientation="right" domain={domain} width={100} tickFormatter={(value: number) => decimal.format(value)} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: '#121826', border: '1px solid #475569', borderRadius: 10, color: '#f8fafc', fontSize: 12 }}
            labelFormatter={(value) => new Date(Number(value)).toLocaleString('es-ES')}
            formatter={(value) => [`${decimal.format(Number(value))} ${asset.currency}`, 'Precio medio']}
            cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
          <Area type="monotone" dataKey="mid" stroke={color} strokeWidth={2} fill={`url(#${gradient})`} baseValue={domain[0]} dot={points.length === 1 ? { r: 3, fill: color } : false} activeDot={{ r: 4 }}
            isAnimationActive={!reducedMotion} animationDuration={350} animationEasing="ease-out" />
          {percentage !== null && <>
            <ReferenceLine y={asset.current_price} stroke="#34d399" strokeDasharray="6 4" label={<QuoteLabel text={`ASK ${decimal.format(asset.current_price)}`} color="#34d399" offset={-7} />} />
            <ReferenceLine y={asset.sell_price!} stroke="#fb923c" strokeDasharray="6 4" label={<QuoteLabel text={`BID ${decimal.format(asset.sell_price!)}`} color="#fb923c" offset={14} />} />
            <ReferenceLine y={(asset.current_price + asset.sell_price!) / 2} stroke="transparent" label={<SpreadLabel spread={decimal.format(spread!)} />} />
          </>}
        </AreaChart>
      </ResponsiveContainer>
      {!points.length && <p className="pointer-events-none absolute inset-x-4 top-1/2 text-center text-xs text-slate-400">No hay ticks en esta ventana. Esperando cotizaciones…</p>}
    </div>
    <p className="px-4 pb-4 text-[10px] leading-relaxed text-slate-500">Ventana {period} · Precio medio · Cotizaciones simuladas observadas en esta sesión (máximo 2.000 ticks por activo). {points.length === 1 ? 'Esperando más ticks para trazar la curva.' : 'Sin historial anterior a la apertura del simulador.'}</p>
  </section>;
}
