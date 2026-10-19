import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { withTimeout } from '../../../lib/withTimeout';
import type { Database } from '../../../types/database.types';

export type Asset = Database['public']['Tables']['assets']['Row'];
export type PortfolioPosition = Database['public']['Tables']['portfolios']['Row'];
export type TradeTransaction = Database['public']['Tables']['transactions']['Row'];
export type OrderType = 'BUY' | 'SELL';

export interface TradeOrder {
  assetId: string;
  orderType: OrderType;
  quantity: string;
  requestId: string;
}

export interface TradeReceipt {
  action: 'execute_trade';
  transaction_id: string;
  resulting_balance: number;
  position_quantity: number;
}

export interface ReloadReceipt {
  action: 'use_life_reload';
  reload_id: string;
  resulting_balance: number;
  remaining_lives: number;
}

export class TradingError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'TradingError';
  }
}

const TRADING_ERROR_MESSAGES: Record<string, string> = {
  INVALID_ORDER: 'Introduce una cantidad válida (hasta 8 decimales).',
  INVALID_QUANTITY_OR_PRICE: 'La cantidad o el precio no son válidos.',
  INSUFFICIENT_FICTIONAL_FUNDS: 'Saldo ficticio insuficiente para esta compra.',
  INSUFFICIENT_ASSET_QUANTITY: 'No tienes suficientes unidades para vender.',
  QUOTE_STALE_OR_UNAVAILABLE: 'La cotización no está actualizada. Inténtalo después.',
  QUOTE_CHANGED_RETRY_REQUIRED: 'El precio ha cambiado. Actualiza y vuelve a confirmar.',
  ASSET_NOT_TRADABLE: 'Este activo no está disponible para operar.',
  ASSET_NOT_FOUND: 'No se encuentra el activo seleccionado.',
  CLOSE_ALL_POSITIONS_BEFORE_RELOAD: 'Cierra todas tus posiciones antes de recargar.',
  RELOAD_ALLOWED_ONLY_WITH_100_OR_LESS: 'Solo puedes recargar si tu saldo es de 100 $ o menos.',
  NO_FREE_LIVES_REMAINING: 'Has agotado las tres recargas del plan Free.',
  REQUEST_ID_REUSED_WITH_DIFFERENT_ORDER: 'El identificador de operación ya se utilizó en otra orden.',
  ORDER_BELOW_ONE_CENT: 'El importe mínimo de una orden es 0,01 $.',
  UNAUTHORIZED: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  PROFILE_NOT_FOUND: 'No se ha encontrado tu perfil.',
};

function normalizeErrorCode(value: unknown): string {
  return typeof value === 'string' && /^[A-Z_]+$/.test(value)
    ? value
    : 'UNKNOWN_ERROR';
}

async function handleFunctionError(error: Error): Promise<never> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload: unknown = await error.context.json();
      if (payload !== null && typeof payload === 'object') {
        const body = payload as Record<string, unknown>;
        const code = normalizeErrorCode(body.code);
        throw new TradingError(
          code,
          TRADING_ERROR_MESSAGES[code] ?? 'No se pudo completar la operación.',
        );
      }
    } catch (parseError) {
      if (parseError instanceof TradingError) throw parseError;
    }
  }

  throw new TradingError(
    'NETWORK_ERROR',
    'No se pudo confirmar el resultado. Reintenta la misma orden sin modificarla.',
  );
}

export async function getAssets(): Promise<Asset[]> {
  const assets: Asset[] = [];
  const pageSize = 500;
  // Supabase limita las filas por respuesta. Leer todo el catálogo evita que
  // filtros y rankings omitan instrumentos cuando el universo crezca.
  while (true) {
    const { data, error } = await supabase.from('assets').select('*')
      .order('ticker', { ascending: true }).order('id', { ascending: true })
      .range(assets.length, assets.length + pageSize - 1);
    if (error) throw new Error('No se pudo cargar el catálogo de mercado.', { cause: error });
    assets.push(...data);
    if (data.length < pageSize) return assets;
  }
}

export async function getPositions(userId: string): Promise<PortfolioPosition[]> {
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getTransactions(userId: string): Promise<TradeTransaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('executed_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// El frontend invoca la Edge Function; únicamente ella puede llamar a las RPC
// restringidas a service_role. Nunca se envía p_user_id ni p_price desde React.
export async function executeTrade(order: TradeOrder): Promise<TradeReceipt> {
  const { data, error } = await supabase.functions.invoke<TradeReceipt>('trading', {
    body: {
      action: 'execute_trade',
      asset_id: order.assetId,
      order_type: order.orderType,
      quantity: order.quantity,
      request_id: order.requestId,
    },
  });

  if (error) return handleFunctionError(error);
  if (!data || data.action !== 'execute_trade') {
    throw new TradingError('INVALID_RESPONSE', 'La respuesta del servidor no es válida.');
  }
  return data;
}

export async function reloadLifeBalance(): Promise<ReloadReceipt> {
  try {
    const { data, error } = await withTimeout(supabase.rpc('refill_portfolio_balance').retry(false));
    if (error) {
      const code = normalizeErrorCode(error.message);
      if (TRADING_ERROR_MESSAGES[code]) throw new TradingError(code, TRADING_ERROR_MESSAGES[code]);
      throw error;
    }
    const result = data?.[0];
    if (!result?.reload_id) throw new Error('Missing reload receipt');
    return { action: 'use_life_reload', ...result };
  } catch (error) {
    if (error instanceof TradingError) throw error;
    // This RPC has no idempotency key: a lost response must never trigger a replay.
    throw new TradingError('RELOAD_RESULT_UNKNOWN', 'No se pudo confirmar la recarga. Puede haberse aplicado. Actualiza y comprueba el saldo y las vidas antes de realizar otra recarga.');
  }
}
