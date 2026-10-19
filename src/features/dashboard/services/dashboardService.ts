import { supabase } from '../../../lib/supabase';
import { marginValue } from '../../trading/utils/margin';
import type { Database } from '../../../types/database.types';
import { buildDashboardSummary } from '../utils/dashboardSummary';
import type { DashboardSummary } from '../utils/dashboardSummary';
import { calculatePerformance } from '../utils/performance';
import type { PerformancePeriod } from '../utils/performance';

type Tables = Database['public']['Tables'];
export type RecentTransaction = Pick<Tables['transactions']['Row'],
  'id' | 'executed_at' | 'transaction_type' | 'quantity' | 'execution_price' | 'total_value' | 'realized_pnl'> & {
    asset: Pick<Tables['assets']['Row'], 'ticker' | 'name'> | null;
  };
export type ProUpgradeRequest = Tables['pro_upgrade_requests']['Row'];

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  return data.user.id;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const userId = await getUserId();
  // Una consulta anidada: saldo, cantidades y precios comparten el mismo snapshot.
  // Los filtros complementan RLS, que sigue siendo la frontera de autorización.
  const { data, error } = await supabase.from('profiles').select(`
    fictional_balance,
    margins:margin_positions!margin_positions_user_id_fkey (
      id, side, investment, quantity, entry_price, closed_at,
      asset:assets!margin_positions_asset_id_fkey (id, ticker, name, current_price, sell_price, price_updated_at, price_source)
    ),
    positions:portfolios!portfolios_user_id_fkey (
      total_quantity, average_buy_price,
      asset:assets!portfolios_asset_id_fkey (
        id, ticker, name, current_price, sell_price, price_updated_at, price_source
      )
    )
  `).eq('id', userId).is('margins.closed_at', null).single();
  if (error) throw new Error('No se pudo cargar el patrimonio. Inténtalo de nuevo.', { cause: error });
  const holdings = data.positions.map((position) => {
    if (!position.asset) throw new Error('Falta la cotización de una posición de tu cartera.');
    return {
      assetId: position.asset.id, ticker: position.asset.ticker, name: position.asset.name,
      quantity: Number(position.total_quantity), averageBuyPrice: Number(position.average_buy_price),
      currentPrice: Number(position.asset.current_price), quotedAt: position.asset.price_updated_at,
      sellPrice: position.asset.sell_price,
      isSimulated: position.asset.price_source === 'simulated',
    };
  });
  const margins = (data.margins ?? []).filter((position) => !position.closed_at).map((position) => {
    const asset = position.asset;
    const value = marginValue(position, asset?.current_price ?? null, asset?.sell_price ?? null);
    if (!asset || !value) throw new Error('No se puede valorar una posición de margen sin Ask/Bid válidos.');
    return {
      assetId: position.id, ticker: `${asset.ticker} · Margen`, name: asset.name,
      quantity: 1, averageBuyPrice: position.investment, currentPrice: value.equity,
      sellPrice: value.equity, quotedAt: asset.price_updated_at, isSimulated: asset.price_source === 'simulated',
      valuation: 'margin' as const,
    };
  });
  return buildDashboardSummary(Number(data.fictional_balance), [...holdings, ...margins]);
}

export async function getRecentTransactions(): Promise<RecentTransaction[]> {
  const userId = await getUserId();
  const { data, error } = await supabase.from('transactions').select(`
    id, executed_at, transaction_type, quantity, execution_price, total_value, realized_pnl,
    asset:assets!transactions_asset_id_fkey (ticker, name)
  `).eq('user_id', userId)
    .order('executed_at', { ascending: false }).order('id', { ascending: false }).limit(5);
  if (error) throw new Error('No se pudieron cargar tus últimas operaciones.', { cause: error });
  return data;
}

export async function getProUpgradeRequest(): Promise<ProUpgradeRequest | null> {
  const userId = await getUserId();
  const { data, error } = await supabase.from('pro_upgrade_requests')
    .select('user_id, created_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('No se pudo consultar tu solicitud de Pro.', { cause: error });
  return data;
}

export async function requestProUpgrade(): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('pro_upgrade_requests').insert({ user_id: userId });
  // Una solicitud existente equivale a éxito, incluso con dos pestañas abiertas.
  if (error && error.code !== '23505') {
    throw new Error('No se pudo registrar la solicitud. Vuelve a intentarlo.', { cause: error });
  }
}

export async function getAdvancedMetrics(period: PerformancePeriod = 'all') {
  const [history, statistics] = await Promise.all([
    supabase.rpc('get_portfolio_performance', { p_period: period }),
    supabase.rpc('get_trading_statistics', { p_period: period }),
  ]);
  if (history.error || statistics.error) throw new Error('No se pudieron cargar las métricas de rendimiento.');
  const stats = statistics.data?.[0];
  return { ...calculatePerformance(history.data ?? []), winRate: stats?.win_rate_pct ?? null, sellCount: stats?.sell_count ?? 0 };
}
export type AdvancedMetrics = Awaited<ReturnType<typeof getAdvancedMetrics>>;
