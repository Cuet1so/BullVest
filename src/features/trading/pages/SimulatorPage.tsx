import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Heart,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { useAssets } from '../hooks/useAssets';
import { supabase } from '../../../lib/supabase';
import { MarginOrderForm } from '../components/MarginOrderForm';
import { MarginPositions } from '../components/MarginPositions';
import { getMarginPositions, openMargin, closeMargin } from '../services/marginService';
import type { MarginOrder, MarginPosition } from '../services/marginService';
import { marginValue } from '../utils/margin';
import { withTimeout } from '../../../lib/withTimeout';
import { bidPositionValue } from '../utils/valuation';
import { OutOfLivesModal } from '../../subscription/components/OutOfLivesModal';
import { TradingError } from '../services/tradingService';
import { OrderForm } from '../components/OrderForm';
import { MarketFilters } from '../components/MarketFilters';
import { MarketTable } from '../components/MarketTable';
import { filterMarketAssets, MARKET_FILTERS } from '../utils/market';
import type { MarketFilter } from '../utils/market';
import { triggerQuoteRefresh } from '../services/quoteService';
import {
  executeTrade,
  getPositions,
  getTransactions,
  reloadLifeBalance,
} from '../services/tradingService';
import type {
  Asset,
  PortfolioPosition,
  TradeTransaction,
  OrderType,
} from '../services/tradingService';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const quantityLabel = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 8,
});

type PendingAction = 'trade' | 'reload' | null;
const LibertexChart = lazy(() => import('../components/LibertexChart'));

export function SimulatorPage() {
  const { user, profile, refreshProfile } = useAuth();
  const userId = user?.id;
  const { assets, readAssets, connection, quoteHistory } = useAssets(userId);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [marginPositions, setMarginPositions] = useState<MarginPosition[]>([]);
  const [executionMode, setExecutionMode] = useState<'spot' | 'margin'>('spot');
  const [transactions, setTransactions] = useState<TradeTransaction[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('popular');
  const [orderType, setOrderType] = useState<OrderType>('BUY');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [reloadSuccess, setReloadSuccess] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);
  const refreshPending = useRef(false);
  const readVersion = useRef(0);
  const mutationPending = useRef(false);
  const [outOfLives, setOutOfLives] = useState(false);
  const orderPanel = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    readVersion.current += 1;
    const version = readVersion.current;
    setLoading(true);
    setDataError(null);
    try {
      // Leer el catalogo solo despues de confirmar el refresco en PostgreSQL.
      await withTimeout(triggerQuoteRefresh());
      if (readVersion.current !== version) return false;
      const [nextAssets, nextPositions, nextTransactions, nextMargin] = await withTimeout(Promise.all([
        readAssets(),
        getPositions(userId),
        getTransactions(userId),
        getMarginPositions(userId),
      ]));
      if (readVersion.current !== version) return false;

      setPositions(nextPositions);
      setTransactions(nextTransactions);
      setMarginPositions(nextMargin);
      setSelectedId((previous) =>
        nextAssets.some((asset) => asset.id === previous)
          ? previous
          : nextAssets.find((asset) => asset.is_popular)?.id ?? nextAssets[0]?.id ?? null,
      );
      return true;
    } catch (error: unknown) {
      if (readVersion.current !== version) return false;
      setDataError(error instanceof Error
        ? error.message
        : 'No se pudieron cargar los datos. Comprueba la conexión y vuelve a intentarlo.');
      return false;
    } finally {
      if (readVersion.current === version) setLoading(false);
    }
  }, [userId, readAssets]);

  const refreshView = useCallback(async (confirmed?: 'reload' | 'trade') => {
    if (refreshPending.current || (!confirmed && mutationPending.current)) return;
    refreshPending.current = true;
    setIsRefreshing(true);
    try {
      // Wait for both reads, even if one fails. Neither operation repeats a mutation.
      const [market, account] = await Promise.allSettled([loadData(), withTimeout(refreshProfile())]);
      if (market.status === 'rejected' || !market.value || account.status === 'rejected' || !account.value) {
        throw new Error('Incomplete account refresh');
      }
      setNeedsSync(false);
      setRefreshWarning(null);
    } catch {
      setNeedsSync(true);
      setRefreshWarning(confirmed === 'reload'
        ? 'La recarga está confirmada, pero no se pudieron actualizar todos los datos. No vuelvas a recargar: reintenta solo la actualización.'
        : confirmed === 'trade'
          ? 'La operación está confirmada, pero faltan datos actualizados. Reintenta solo la actualización.'
          : 'No se pudieron actualizar todos los datos. Se conserva la última información disponible. Reintenta la actualización antes de operar.');
    } finally {
      refreshPending.current = false;
      setIsRefreshing(false);
    }
  }, [loadData, refreshProfile]);

  useEffect(() => {
    let cancelled = false;

    // Evitar iniciar una carga si el efecto ya se ha limpiado.
    queueMicrotask(() => {
      if (!cancelled) {
        void loadData();
      }
    });

    return () => {
      cancelled = true;
      readVersion.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    if (!userId || loading || isRefreshing || needsSync || pendingAction !== null) return;

    const refreshVisibleQuotes = () => {
      if (document.visibilityState === 'visible') void loadData();
    };
    // Margen respecto al limite de 120 s, tambien al volver a una pestaña dormida.
    const intervalId = window.setInterval(refreshVisibleQuotes, 60_000);
    document.addEventListener('visibilitychange', refreshVisibleQuotes);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshVisibleQuotes);
    };
  }, [userId, loading, isRefreshing, needsSync, pendingAction, loadData]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const channel = supabase.channel(`margin:${userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'margin_positions', filter: `user_id=eq.${userId}`,
    }, () => {
      if (active) void refreshView();
    }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel).catch(() => {}); };
  }, [userId, refreshView]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedId) ?? null,
    [assets, selectedId],
  );
  const selectedHolding = positions.find((position) => position.asset_id === selectedId);
  const balance = Number(profile?.fictional_balance ?? 0);
  const unlimitedReloads = profile?.role === 'pro' || profile?.role === 'admin';
  const isRefilling = pendingAction === 'reload';
  const lives = Number(profile?.lives_remaining ?? 0);

  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  const positionSummaries = useMemo(() => positions.map((position) => {
    const asset = assetsById.get(position.asset_id);
    const quantity = Number(position.total_quantity);
    const cost = quantity * Number(position.average_buy_price);
    const currentValue = asset ? quantity * Number(asset.current_price) : null;
    const bidValue = asset ? bidPositionValue(quantity, asset.current_price, asset.sell_price) : null;
    return {
      position,
      asset,
      quantity,
      cost,
      currentValue,
      bidValue,
      pnl: bidValue === null ? null : bidValue - cost,
    };
  }), [positions, assetsById]);

  const openMargins = marginPositions.filter((position) => !position.closed_at);
  const marginValues = openMargins.map((position) => {
    const asset = assetsById.get(position.asset_id);
    return marginValue(position, asset?.current_price ?? null, asset?.sell_price ?? null);
  });
  const marginEquity = marginValues.reduce((total, item) => total + (item?.equity ?? 0), 0);
  const holdingsValue = marginEquity + positionSummaries.reduce(
    (total, item) => total + (item.currentValue ?? 0), 0,
  );
  const marketDataComplete = marginValues.every((item) => item !== null) && positionSummaries.every((item) => item.currentValue !== null);
  const investedCost = openMargins.reduce((total, item) => total + item.investment, 0) + positionSummaries.reduce((total, item) => total + item.cost, 0);
  const bidComplete = marginValues.every((item) => item !== null) && positionSummaries.every((item) => item.bidValue !== null);
  const bidValue = bidComplete ? marginEquity + positionSummaries.reduce((total, item) => total + item.bidValue!, 0) : null;
  const unrealizedPnl = bidValue === null ? null : bidValue - investedCost;
  const visibleAssets = useMemo(
    () => filterMarketAssets(assets, marketFilter, search),
    [assets, marketFilter, search],
  );
  const searching = search.trim().length > 0;
  const canReload =
    !!profile &&
    pendingAction === null &&
    !loading && !isRefreshing && !needsSync;

  function openOrder(asset: Asset, side: OrderType) {
    if (pendingAction !== null || loading || isRefreshing || needsSync || dataError) return;
    setSelectedId(asset.id);
    setOrderType(side);
    requestAnimationFrame(() => {
      orderPanel.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      orderPanel.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  }

  async function submitTrade(
    orderType: OrderType,
    quantity: string,
    requestId: string,
  ): Promise<void> {
    if (!selectedAsset || pendingAction || mutationPending.current || refreshPending.current || isRefreshing || needsSync) {
      throw new Error('Selecciona un activo y espera a que termine la operación anterior.');
    }
    mutationPending.current = true;
    setPendingAction('trade');
    setReloadError(null);
    setReloadSuccess(null);
    try {
      await executeTrade({
        assetId: selectedAsset.id,
        orderType,
        quantity,
        requestId,
      });
      setNeedsSync(true);
      await refreshView('trade');
    } finally {
      mutationPending.current = false;
      setPendingAction(null);
    }
  }

  async function mutateMargin(order: MarginOrder | string): Promise<void> {
    if (mutationPending.current || refreshPending.current || needsSync) throw new Error('Espera a que termine la sincronizacion.');
    mutationPending.current = true; setPendingAction('trade');
    try {
      if (typeof order === 'string') await closeMargin(order); else await openMargin(order);
      setNeedsSync(true);
      await refreshView('trade');
    } finally { mutationPending.current = false; setPendingAction(null); }
  }

  async function reloadWallet(): Promise<void> {
    if (!canReload || mutationPending.current || refreshPending.current) return;
    if (!unlimitedReloads && lives <= 0) { setOutOfLives(true); return; }
    mutationPending.current = true;
    setPendingAction('reload');
    setReloadError(null);
    setReloadSuccess(null);
    try {
      try {
        const result = await reloadLifeBalance();
        setReloadSuccess(`Monedero recargado: ${money.format(result.resulting_balance)}. Vidas restantes: ${result.remaining_lives}.`);
        setNeedsSync(true);
      } catch (error: unknown) {
        if (error instanceof TradingError && error.code === 'NO_FREE_LIVES_REMAINING') setOutOfLives(true);
        if (!(error instanceof TradingError) || error.code === 'RELOAD_RESULT_UNKNOWN') setNeedsSync(true);
        setReloadError(error instanceof Error ? error.message : 'No se pudo confirmar la recarga. Actualiza el saldo y las vidas antes de continuar.');
        return;
      }
      await refreshView('reload');
    } finally {
      mutationPending.current = false;
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-8 text-zinc-100">
      {outOfLives && <OutOfLivesModal onClose={() => setOutOfLives(false)} />}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Paper Trading</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Simulador de inversión</h1>
          <p className="mt-2 text-sm text-zinc-400">Aprende comprando y vendiendo con capital ficticio.</p>
        </div>
        <button type="button" onClick={() => void refreshView()}
          disabled={loading || isRefreshing || pendingAction !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
          <RefreshCw className="size-4" aria-hidden="true" /> Actualizar
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Saldo disponible" value={money.format(balance)} icon={<Wallet className="size-5 text-emerald-400" />} />
        <SummaryCard label="Patrimonio ficticio (Ask)" value={marketDataComplete ? money.format(balance + holdingsValue) : 'No disponible'} hint="Efectivo + contado a Ask + margen neto de P/L" />
        <SummaryCard label="P/L latente de venta (Bid)" value={unrealizedPnl === null ? 'No disponible' : money.format(unrealizedPnl)} hint={bidValue === null ? 'Falta un precio de venta válido; no se sustituye por Ask.' : `Patrimonio estimado al vender: ${money.format(balance + bidValue)}. Precios sujetos a actualización.`} valueClass={unrealizedPnl === null ? 'text-zinc-400' : unrealizedPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
      </div>

      {dataError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {dataError}
          <button type="button" disabled={loading || isRefreshing || pendingAction !== null} onClick={() => void refreshView()} className="ml-3 underline disabled:opacity-50">Reintentar</button>
        </div>
      )}
      {refreshWarning && <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
        {refreshWarning} <button type="button" disabled={loading || isRefreshing || pendingAction !== null} onClick={() => void refreshView()} className="underline disabled:opacity-50">Reintentar actualización</button>
      </div>}

      <section aria-labelledby="market-heading" className="min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div><h2 id="market-heading" className="text-lg font-semibold">Mercados</h2><p className="mt-1 text-xs text-zinc-500">Catálogo global · Cuenta demo</p></div>
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-zinc-500" aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar en todos los mercados" aria-label="Buscar activos por ticker o nombre" aria-describedby="market-search-help"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-10 text-sm outline-none focus:border-emerald-400" />
            {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')} className="absolute right-2 top-2 rounded p-1 text-zinc-400 hover:text-white"><X className="size-4" /></button>}
            <span id="market-search-help" className="sr-only">Busca por nombre o ticker en todo el catálogo, independientemente de la pestaña. Seleccionar una pestaña limpia la búsqueda.</span>
          </div>
        </div>
        <MarketFilters value={marketFilter} searching={searching} onChange={(filter) => { setMarketFilter(filter); setSearch(''); }} />
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-zinc-500">
          <p aria-live="polite">{searching ? 'Resultados en todo el mercado' : MARKET_FILTERS.find((filter) => filter.id === marketFilter)?.label} · {visibleAssets.length} de {assets.length} instrumentos</p>
          <span className="text-emerald-300">{connection === 'live' ? 'Realtime conectado' : connection === 'fallback' ? 'Realtime no disponible; refresco periodico activo' : 'Conectando Realtime'}</span><span className="inline-flex items-center gap-2">{loading && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}{loading ? 'Actualizando cotizaciones…' : 'Precios de demostración · Capital ficticio'}</span>
        </div>
        <div className="grid min-w-0 items-start gap-0 border-t border-zinc-800 xl:grid-cols-2">
          <div id="market-results" role="tabpanel" aria-label={searching ? 'Resultados de búsqueda global' : undefined}
            aria-labelledby={searching ? undefined : `market-tab-${marketFilter}`} aria-busy={loading} className="min-w-0">
            <MarketTable assets={visibleAssets} selectedId={selectedId} filter={searching ? null : marketFilter}
                  loading={loading && assets.length === 0}
                  disabled={loading || isRefreshing || needsSync || !!dataError || pendingAction !== null} onOrder={openOrder} />
          </div>
          <div ref={orderPanel} className="min-w-0 scroll-mt-32 border-t border-zinc-800 p-3 xl:border-t-0 xl:border-l">
            {selectedAsset && <Suspense fallback={<div className="mb-4 h-96 animate-pulse rounded-2xl bg-[#121826]" role="status" aria-label="Cargando gráfico" />}>
              <LibertexChart key={selectedAsset.id} asset={selectedAsset} ticks={quoteHistory[selectedAsset.id] ?? []} connection={connection} />
            </Suspense>}
            <div className="mb-3 flex gap-2" role="group" aria-label="Modo de ejecucion">{(['spot', 'margin'] as const).map((mode) => <button key={mode} type="button" disabled={pendingAction !== null} aria-pressed={executionMode === mode} onClick={() => setExecutionMode(mode)} className={`flex-1 rounded-lg border px-2 py-3 text-xs ${executionMode === mode ? 'border-emerald-400 text-emerald-300' : 'border-zinc-700 text-zinc-400'}`}>{mode === 'spot' ? 'Al contado' : 'Margen / Multiplicador'}</button>)}</div>
            {executionMode === 'margin' && selectedAsset ? <MarginOrderForm key={selectedAsset.id + ':' + orderType} asset={selectedAsset} side={orderType} onSideChange={setOrderType} balance={balance} disabled={loading || isRefreshing || needsSync || !!dataError || pendingAction !== null} onExecute={mutateMargin} /> : <OrderForm key={`${selectedAsset?.id ?? 'none'}:${orderType}`} asset={selectedAsset}
              orderType={orderType} onOrderTypeChange={setOrderType} availableBalance={balance}
              heldQuantity={Number(selectedHolding?.total_quantity ?? 0)}
              disabled={loading || isRefreshing || needsSync || !!dataError || pendingAction !== null} onExecute={submitTrade} />}
          </div>
        </div>
      </section>
      <MarginPositions positions={marginPositions} assets={assets} disabled={loading || isRefreshing || needsSync || pendingAction !== null} onClose={mutateMargin} />

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Tus posiciones</h2><p className="mt-1 text-xs text-zinc-400">Rentabilidad teórica calculada con el último precio disponible.</p></div>
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">{positions.length} posiciones</span>
        </div>
        {positions.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Aún no tienes posiciones abiertas.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-140 text-left text-sm"><thead className="border-b border-zinc-800 text-xs text-zinc-400"><tr><th className="py-3">Activo</th><th className="py-3 text-right">Unidades</th><th className="py-3 text-right">Precio medio pagado</th><th className="py-3 text-right">Valor Ask</th><th className="py-3 text-right">Valor Bid</th><th className="py-3 text-right">P/L latente Bid</th></tr></thead><tbody>
            {positionSummaries.map((item) => (
              <tr key={item.position.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="py-3 font-semibold">{item.asset?.ticker ?? 'Desconocido'}</td>
                <td className="py-3 text-right tabular-nums">{quantityLabel.format(item.quantity)}</td>
                <td className="py-3 text-right tabular-nums">{money.format(Number(item.position.average_buy_price))}</td>
                <td className="py-3 text-right tabular-nums">{item.currentValue === null ? '—' : money.format(item.currentValue)}</td>
                <td className="py-3 text-right tabular-nums">{item.bidValue === null ? '—' : money.format(item.bidValue)}</td>
                <td className={`py-3 text-right font-semibold tabular-nums ${item.pnl === null ? 'text-zinc-400' : item.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{item.pnl === null ? '—' : money.format(item.pnl)}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Heart className="size-5 text-rose-400" aria-hidden="true" /> Recarga de vidas</h2>
            <p className="mt-2 text-sm text-zinc-400">{unlimitedReloads ? `Plan ${profile?.role === 'admin' ? 'Admin' : 'Pro'}: recargas ilimitadas.` : `Plan Free: ${lives} de 3 recargas restantes.`}</p>
            <p className="mt-1 text-xs text-zinc-500">Restablece tu saldo a 10.000 $ ficticios. Cada recarga consume una vida en Free; tus posiciones se conservan.</p>
          </div>
          <button type="button" disabled={!canReload || isRefilling} aria-busy={isRefilling} onClick={() => void reloadWallet()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
            {isRefilling && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            Recargar 10.000 $
          </button>
        </div>
        {reloadError && <p role="alert" className="mt-4 text-sm text-red-300">{reloadError}</p>}
        {reloadSuccess && <p role="status" className="mt-4 text-sm text-emerald-300">{reloadSuccess}</p>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Últimas operaciones</h2>
        {transactions.length === 0 ? (
          <p className="py-5 text-sm text-zinc-400">Todavía no has realizado operaciones.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-135 text-sm"><thead className="border-b border-zinc-800 text-xs text-zinc-400"><tr><th className="py-3 text-left">Fecha</th><th className="py-3 text-left">Activo</th><th className="py-3 text-left">Operación</th><th className="py-3 text-right">Cantidad</th><th className="py-3 text-right">Precio ejecutado</th><th className="py-3 text-right">Importe</th><th className="py-3 text-right">P/L realizado</th></tr></thead><tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="py-3 text-zinc-400">{new Date(tx.executed_at).toLocaleString('es-ES')}</td>
                <td className="py-3 font-medium">{assetsById.get(tx.asset_id)?.ticker ?? '—'}</td>
                <td className="py-3">{tx.transaction_type === 'BUY' ? <span className="inline-flex items-center gap-1 text-emerald-300"><ArrowDownLeft className="size-4" />Compra</span> : <span className="inline-flex items-center gap-1 text-amber-300"><ArrowUpRight className="size-4" />Venta</span>}</td>
                <td className="py-3 text-right tabular-nums">{quantityLabel.format(Number(tx.quantity))}</td>
                <td className="py-3 text-right tabular-nums">{money.format(Number(tx.execution_price))}<span className="block text-xs text-zinc-500">{tx.transaction_type === 'BUY' ? 'Ask' : 'Bid'}</span></td>
                <td className="py-3 text-right font-medium tabular-nums">{money.format(Number(tx.total_value))}</td>
                <td className="py-3 text-right tabular-nums">{tx.transaction_type === 'SELL' && tx.realized_pnl != null ? money.format(tx.realized_pnl) : '?'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <p className="text-xs text-zinc-500">Simulador educativo: los precios pueden ser diferidos, no se ejecutan operaciones reales. Los cálculos mostrados en pantalla son estimaciones; el servidor determina el importe definitivo.</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  valueClass = 'text-white',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  valueClass?: string;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-zinc-400">{label}</p>{icon}</div>
      <p className={`mt-3 text-2xl font-bold tabular-nums tracking-tight ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </section>
  );
}
