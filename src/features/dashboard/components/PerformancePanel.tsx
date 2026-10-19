import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { withTimeout } from '../../../lib/withTimeout';
import { getAdvancedMetrics } from '../services/dashboardService';
import type { AdvancedMetrics } from '../services/dashboardService';
import { PERFORMANCE_PERIODS } from '../utils/performance';
import type { PerformancePeriod } from '../utils/performance';

const EquityCurveChart = lazy(() => import('./EquityCurveChart').then((m) => ({ default: m.EquityCurveChart })));
const percent = (value: number | null) => value === null ? '—' : `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
export function PerformancePanel({ refreshKey }: { refreshKey: string }) {
  const [period, setPeriod] = useState<PerformancePeriod>('all');
  const [data, setData] = useState<AdvancedMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true); setError(null);
    try { const next = await withTimeout(getAdvancedMetrics(period)); if (current === version.current) setData(next); }
    catch (failure) { if (current === version.current) setError(failure instanceof Error ? failure.message : 'No se pudo cargar el rendimiento.'); }
    finally { if (current === version.current) setLoading(false); }
  }, [period]);
  useEffect(() => {
    let cancelled = false;
    const requestVersion = version;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; requestVersion.current++; };
  }, [load, refreshKey]);
  return (
    <section aria-labelledby="performance-heading" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 id="performance-heading" className="text-lg font-semibold">Evolución y rendimiento</h2><p className="mt-1 text-xs text-zinc-400">Historial de patrimonio a Ask y riesgo de tu cartera ficticia. No representa el importe de liquidación a Bid.</p></div>
        <div className="flex gap-1 rounded-xl bg-zinc-950 p-1" role="group" aria-label="Periodo de rendimiento">{PERFORMANCE_PERIODS.map((item) => <button key={item.id} type="button" aria-pressed={period === item.id} onClick={() => { if (period !== item.id) { setPeriod(item.id); setData(null); } }} className={`rounded-lg px-3 py-2 text-xs ${period === item.id ? 'bg-zinc-800 text-emerald-300' : 'text-zinc-400'}`}>{item.label}</button>)}</div>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error} <button type="button" onClick={() => void load()} className="underline">Reintentar métricas</button></p>}
      {loading && !data ? <p role="status" className="flex items-center gap-2 py-20 text-sm text-zinc-400"><LoaderCircle className="size-5 animate-spin" />Cargando rendimiento…</p> : data && <>
        <div className="my-6 grid gap-3 sm:grid-cols-3">
          <Metric label="Win Rate" value={percent(data.winRate)} note={`${data.sellCount} ventas cerradas; las ventas sin ganancia no cuentan como victoria.`} />
          <Metric label="Max Drawdown" value={percent(data.maxDrawdown)} note="Caída máxima observada del índice ajustado por recargas; no incluye mínimos entre observaciones." />
          <Metric label="Ratio Sharpe" value={data.sharpe?.toLocaleString('es-ES', { maximumFractionDigits: 2 }) ?? '—'} note={`${data.dailyReturnCount} retornos diarios válidos. Anualización 365 días, tasa libre de riesgo 0 %. Requiere al menos 2 retornos y variación.`} />
        </div>
        <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-zinc-800" />}><EquityCurveChart points={data.curve} /></Suspense>
        <p className="mt-4 text-xs leading-5 text-zinc-500">{data.since ? `Historial observado desde ${new Date(data.since).toLocaleDateString('es-ES', { timeZone: 'UTC' })} (UTC).` : 'El historial empieza cuando se registra la primera valoración.'} La curva incluye el capital añadido o retirado; el riesgo se calcula con retornos ajustados por esos flujos (Modified Dietz). No se reconstruyen fechas sin datos.</p>
        {(data.hasStaleQuotes || data.hasGaps) && <p className="mt-2 text-xs text-amber-300">{data.hasStaleQuotes ? 'Hay valoraciones con cotizaciones antiguas; esos cierres no se usan en Sharpe. ' : ''}{data.hasGaps ? 'No se puede calcular un drawdown completo con los datos de este periodo.' : ''}</p>}
      </>}
    </section>
  );
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><h3 className="text-xs text-zinc-400">{label}</h3><p className="mt-2 text-2xl font-semibold text-zinc-100 tabular-nums">{value}</p><p className="mt-2 text-[11px] leading-5 text-zinc-500">{note}</p></div>;
}
