import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Heart,
  LoaderCircle,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { OrderForm } from '../components/OrderForm';
import { triggerQuoteRefresh } from '../services/quoteService';
import {
  executeTrade,
  getAssets,
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

export function SimulatorPage() {
  const { user, profile, refreshProfile } = useAuth();
  const userId = user?.id;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [transactions, setTransactions] = useState<TradeTransaction[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [reloadSuccess, setReloadSuccess] = useState<string | null>(null);
  const readVersion = useRef(0);

  const loadData = useCallback(async () => {
    if (!userId) return;
    readVersion.current += 1;
    const version = readVersion.current;
    setLoading(true);
    setDataError(null);
    try {
      // Leer el catalogo solo despues de confirmar el refresco en PostgreSQL.
      await triggerQuoteRefresh();
      if (readVersion.current !== version) return;
      const [nextAssets, nextPositions, nextTransactions] = await Promise.all([
        getAssets(),
        getPositions(userId),
        getTransactions(userId),
      ]);
      if (readVersion.current !== version) return;
      setAssets(nextAssets);
      setPositions(nextPositions);
      setTransactions(nextTransactions);
      setSelectedId((previous) =>
        nextAssets.some((asset) => asset.id === previous)
          ? previous
          : nextAssets[0]?.id ?? null,
      );
    } catch (error: unknown) {
      if (readVersion.current !== version) return;
      setDataError(error instanceof Error
        ? error.message
        : 'No se pudieron cargar los datos. Comprueba la conexión y vuelve a intentarlo.');
    } finally {
      if (readVersion.current === version) setLoading(false);
    }
  }, [userId]);

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
    if (!userId || loading || pendingAction !== null) return;

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
  }, [userId, loading, pendingAction, loadData]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedId) ?? null,
    [assets, selectedId],
  );
  const selectedHolding = positions.find((position) => position.asset_id === selectedId);
  const balance = Number(profile?.fictional_balance ?? 0);
  const isPro = profile?.role === 'pro';
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
    return {
      position,
      asset,
      quantity,
      cost,
      currentValue,
      pnl: currentValue === null ? null : currentValue - cost,
    };
  }), [positions, assetsById]);

  const holdingsValue = positionSummaries.reduce(
    (total, item) => total + (item.currentValue ?? 0), 0,
  );
  const marketDataComplete = positionSummaries.every((item) => item.currentValue !== null);
  const investedCost = positionSummaries.reduce((total, item) => total + item.cost, 0);
  const unrealizedPnl = holdingsValue - investedCost;
  const visibleAssets = assets.filter((asset) =>
    `${asset.ticker} ${asset.name}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const canReload =
    !!profile &&
    positions.length === 0 &&
    balance <= 100 &&
    (isPro || lives > 0) &&
    pendingAction === null &&
    !loading &&
    !dataError;

  async function submitTrade(
    orderType: OrderType,
    quantity: string,
    requestId: string,
  ): Promise<void> {
    if (!selectedAsset || pendingAction) {
      throw new Error('Selecciona un activo y espera a que termine la operación anterior.');
    }
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
      await Promise.all([refreshProfile(), loadData()]);
    } finally {
      setPendingAction(null);
    }
  }

  async function reloadWallet(): Promise<void> {
    if (!canReload) return;
    setPendingAction('reload');
    setReloadError(null);
    setReloadSuccess(null);
    try {
      const result = await reloadLifeBalance();
      setReloadSuccess(`Monedero recargado: ${money.format(result.resulting_balance)}.`);
      await Promise.all([refreshProfile(), loadData()]);
    } catch (error: unknown) {
      setReloadError(error instanceof Error ? error.message : 'No se pudo recargar el saldo.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-8 text-zinc-100">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Paper Trading</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Simulador de inversión</h1>
          <p className="mt-2 text-sm text-zinc-400">Aprende comprando y vendiendo con capital ficticio.</p>
        </div>
        <button type="button" onClick={() => void Promise.all([loadData(), refreshProfile()])}
          disabled={loading || pendingAction !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
          <RefreshCw className="size-4" aria-hidden="true" /> Actualizar
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Saldo disponible" value={money.format(balance)} icon={<Wallet className="size-5 text-emerald-400" />} />
        <SummaryCard label="Patrimonio ficticio" value={marketDataComplete ? money.format(balance + holdingsValue) : 'No disponible'} hint="Efectivo + valor de las posiciones" />
        <SummaryCard label="P/L latente" value={marketDataComplete ? money.format(unrealizedPnl) : 'No disponible'} hint="Variación respecto al coste de compra" valueClass={unrealizedPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
      </div>

      {dataError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {dataError}
          <button type="button" onClick={() => void loadData()} className="ml-3 underline">Reintentar</button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Mercado disponible</h2>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar ticker o empresa" aria-label="Buscar activos"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-400 sm:w-56" />
          </div>
          {loading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-zinc-400"><LoaderCircle className="size-4 animate-spin" />Cargando cotizaciones…</p>
          ) : visibleAssets.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-400">No hay activos disponibles. Comprueba el catálogo y la sincronización de precios.</p>
          ) : (
            <div className="max-h-105 space-y-2 overflow-y-auto">
              {visibleAssets.map((asset) => (
                <button type="button" key={asset.id} onClick={() => setSelectedId(asset.id)}
                  disabled={pendingAction !== null}
                  aria-pressed={selectedId === asset.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${selectedId === asset.id ? 'border-emerald-500/70 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-600'}`}>
                  <span className="min-w-0"><span className="block font-semibold">{asset.ticker}</span><span className="block truncate text-xs text-zinc-400">{asset.name}</span></span>
                  <span className="shrink-0 text-right"><span className="block font-semibold tabular-nums">{money.format(Number(asset.current_price))}</span><span className={`block text-xs ${asset.is_tradable ? 'text-zinc-400' : 'text-amber-300'}`}>{asset.is_tradable ? asset.quote_is_delayed ? 'Precio diferido' : 'Precio indicado' : 'No operable'}</span></span>
                </button>
              ))}
            </div>
          )}
        </section>

        <OrderForm key={selectedAsset?.id ?? 'none'} asset={selectedAsset}
          availableBalance={balance}
          heldQuantity={Number(selectedHolding?.total_quantity ?? 0)}
          disabled={loading || !!dataError || pendingAction !== null}
          onExecute={submitTrade} />
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Tus posiciones</h2><p className="mt-1 text-xs text-zinc-400">Rentabilidad teórica calculada con el último precio disponible.</p></div>
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">{positions.length} posiciones</span>
        </div>
        {positions.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Aún no tienes posiciones abiertas.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-140 text-left text-sm"><thead className="border-b border-zinc-800 text-xs text-zinc-400"><tr><th className="py-3">Activo</th><th className="py-3 text-right">Unidades</th><th className="py-3 text-right">Precio medio</th><th className="py-3 text-right">Valor</th><th className="py-3 text-right">P/L latente</th></tr></thead><tbody>
            {positionSummaries.map((item) => (
              <tr key={item.position.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="py-3 font-semibold">{item.asset?.ticker ?? 'Desconocido'}</td>
                <td className="py-3 text-right tabular-nums">{quantityLabel.format(item.quantity)}</td>
                <td className="py-3 text-right tabular-nums">{money.format(Number(item.position.average_buy_price))}</td>
                <td className="py-3 text-right tabular-nums">{item.currentValue === null ? '—' : money.format(item.currentValue)}</td>
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
            <p className="mt-2 text-sm text-zinc-400">{isPro ? 'Plan Pro: recargas ilimitadas.' : `Plan Free: ${lives} de 3 recargas restantes.`}</p>
            <p className="mt-1 text-xs text-zinc-500">Requiere cerrar todas las posiciones y disponer de 100 $ o menos. Recuperas 50.000 $ ficticios.</p>
          </div>
          <button type="button" disabled={!canReload} onClick={() => void reloadWallet()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
            {pendingAction === 'reload' && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            Recargar 50.000 $
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
          <div className="overflow-x-auto"><table className="w-full min-w-135 text-sm"><thead className="border-b border-zinc-800 text-xs text-zinc-400"><tr><th className="py-3 text-left">Fecha</th><th className="py-3 text-left">Activo</th><th className="py-3 text-left">Operación</th><th className="py-3 text-right">Cantidad</th><th className="py-3 text-right">Importe</th></tr></thead><tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="py-3 text-zinc-400">{new Date(tx.executed_at).toLocaleString('es-ES')}</td>
                <td className="py-3 font-medium">{assetsById.get(tx.asset_id)?.ticker ?? '—'}</td>
                <td className="py-3">{tx.transaction_type === 'BUY' ? <span className="inline-flex items-center gap-1 text-emerald-300"><ArrowDownLeft className="size-4" />Compra</span> : <span className="inline-flex items-center gap-1 text-amber-300"><ArrowUpRight className="size-4" />Venta</span>}</td>
                <td className="py-3 text-right tabular-nums">{quantityLabel.format(Number(tx.quantity))}</td>
                <td className="py-3 text-right font-medium tabular-nums">{money.format(Number(tx.total_value))}</td>
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
