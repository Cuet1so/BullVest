import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { triggerQuoteRefresh } from '../../trading/services/quoteService';
import { AccountStatusWidget } from '../components/AccountStatusWidget';
import { NetWorthWidget } from '../components/NetWorthWidget';
import { RecentTransactionsWidget } from '../components/RecentTransactionsWidget';
import { PerformancePanel } from '../components/PerformancePanel';
import { getDashboardSummary, getRecentTransactions } from '../services/dashboardService';
import type { RecentTransaction } from '../services/dashboardService';
import type { DashboardSummary } from '../utils/dashboardSummary';

const AllocationChart = lazy(() => import('../components/AllocationChart').then((module) => ({ default: module.AllocationChart })));

interface DashboardData {
  userId: string;
  summary: DashboardSummary;
  transactions: RecentTransaction[];
  loadedAt: Date;
  quoteWarning: boolean;
}

export function DashboardPage() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const readVersion = useRef(0);
  const inFlight = useRef(false);

  const loadDashboard = useCallback(async () => {
    if (!userId) return;
    const version = ++readVersion.current;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      // Si falla la ingesta, mostrar la valoración disponible con una advertencia.
      const quoteWarning = await triggerQuoteRefresh().then(() => false, () => true);
      if (version !== readVersion.current) return;
      const [summary, transactions] = await Promise.all([getDashboardSummary(), getRecentTransactions()]);
      if (version !== readVersion.current) return;
      setData({ userId, summary, transactions, loadedAt: new Date(), quoteWarning });
    } catch (loadError) {
      if (version === readVersion.current) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el dashboard.');
    } finally {
      if (version === readVersion.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadDashboard(); });
    const refreshVisible = () => {
      if (document.visibilityState === 'visible' && !inFlight.current) void loadDashboard();
    };
    const interval = window.setInterval(refreshVisible, 60_000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      cancelled = true;
      readVersion.current += 1;
      inFlight.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [loadDashboard]);

  const currentData = data?.userId === userId ? data : null;
  const name = profile?.display_name?.trim() || user?.email || 'inversor';
  return (
    <div className="space-y-6 text-zinc-100">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Tu centro financiero</p><h1 className="mt-2 break-words text-3xl font-bold tracking-tight">Hola, {name}</h1><p className="mt-2 text-sm text-zinc-400">Tu patrimonio, tu cartera y tus próximos pasos, en un mismo lugar.</p></div>
        <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-emerald-300"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />{loading ? 'Actualizando…' : 'Actualizar'}</button>
      </header>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200"><AlertCircle className="size-4 shrink-0" aria-hidden="true" /><span>{error} {currentData && 'Se muestran los últimos datos cargados.'}</span><button type="button" onClick={() => void loadDashboard()} disabled={loading} className="underline disabled:opacity-50">Reintentar</button></div>}
      {currentData && (currentData.quoteWarning || currentData.summary.hasStaleQuotes) && <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">No se han podido confirmar cotizaciones recientes. La valoración usa los últimos precios disponibles.</p>}
      <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3" aria-busy={loading}>
        <div className="min-w-0 md:col-span-2">{currentData ? <NetWorthWidget summary={currentData.summary} /> : loading ? <WidgetSkeleton label="Cargando patrimonio" /> : <UnavailableWidget label="Patrimonio no disponible" />}</div>
        <div className="min-w-0 md:col-span-2 xl:col-span-1"><AccountStatusWidget key={userId} /></div>
        <div className="min-w-0">{currentData ? <Suspense fallback={<WidgetSkeleton label="Cargando gráfico" />}><AllocationChart summary={currentData.summary} /></Suspense> : loading ? <WidgetSkeleton label="Cargando distribución" /> : <UnavailableWidget label="Distribución no disponible" />}</div>
        <div className="min-w-0 xl:col-span-2">{currentData ? <RecentTransactionsWidget transactions={currentData.transactions} /> : loading ? <WidgetSkeleton label="Cargando operaciones" /> : <UnavailableWidget label="Operaciones no disponibles" />}</div>
      </div>
      {currentData && <PerformancePanel refreshKey={currentData.loadedAt.toISOString()} />}
      {currentData && <p className="flex flex-wrap justify-between gap-2 text-xs text-zinc-500"><span>Valoración orientativa del simulador. {currentData.summary.hasSimulatedQuotes ? 'Incluye precios ficticios de demostración.' : 'No se opera con dinero real.'}</span><span>Última consulta: <time dateTime={currentData.loadedAt.toISOString()}>{currentData.loadedAt.toLocaleTimeString('es-ES')}</time></span></p>}
    </div>
  );
}

function WidgetSkeleton({ label }: { label: string }) {
  return <div role="status" className="min-h-80 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6"><span className="sr-only">{label}</span><div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse"><div className="h-4 w-36 rounded bg-zinc-800" /><div className="h-12 w-3/4 rounded-lg bg-zinc-800" /><div className="h-2 w-full rounded bg-zinc-800" /><div className="mt-12 grid grid-cols-2 gap-4"><div className="h-20 rounded-lg bg-zinc-800" /><div className="h-20 rounded-lg bg-zinc-800" /></div></div></div>;
}

function UnavailableWidget({ label }: { label: string }) {
  return <div className="flex min-h-48 items-center justify-center rounded-2xl border border-zinc-800 p-6 text-sm text-zinc-400">{label}</div>;
}
