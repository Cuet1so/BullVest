import { supabase } from '../../../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { OrderType } from './tradingService';

export interface MarginPosition {
  id: string; user_id: string; asset_id: string; client_request_id: string;
  side: OrderType; investment: number; multiplier: number; entry_price: number;
  quantity: number; stop_loss_amount: number | null; take_profit_amount: number | null;
  commission: number; opened_at: string; closed_at: string | null; exit_price: number | null;
  realized_pnl: number | null; close_reason: string | null; balance_after: number;
}
export interface MarginOrder {
  asset_id: string; side: OrderType; investment: number; multiplier: number;
  request_id: string; stop_loss: number | null; take_profit: number | null;
}
async function invoke(body: ({ action: 'open_margin' } & MarginOrder) | { action: 'close_margin'; position_id: string }) {
  const { data, error } = await supabase.functions.invoke<{ action: string; position: MarginPosition }>('trading', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const result = await error.context.json().catch(() => null);
      const messages: Record<string, string> = {
        INSUFFICIENT_FICTIONAL_FUNDS: 'Saldo insuficiente para reservar el margen.',
        TOO_MANY_OPEN_POSITIONS: 'Puedes mantener hasta 100 posiciones de margen abiertas.',
        MARGIN_TOO_SMALL_FOR_SPREAD: 'El spread alcanza tu margen o Stop Loss. Reduce el multiplicador.',
        QUOTE_STALE_OR_UNAVAILABLE: 'Cotización caducada o no disponible.',
        INVALID_MARGIN_ORDER: 'Revisa los importes de inversión y TP/SL.',
        REQUEST_ID_REUSED_WITH_DIFFERENT_ORDER: 'Este identificador corresponde a otra orden.',
      };
      if (result?.code && messages[result.code]) throw new Error(messages[result.code]);
    }
    throw new Error('No se pudo confirmar el resultado. Reintenta la misma orden sin modificarla.');
  }
  if (!data?.position?.id || data.action !== body.action) throw new Error('Resultado no confirmado. Reintenta la misma orden.');
  return data.position;
}
export const openMargin = (order: MarginOrder) => invoke({ action: 'open_margin', ...order });
export const closeMargin = (positionId: string) => invoke({ action: 'close_margin', position_id: positionId });
export async function getMarginPositions(userId: string): Promise<MarginPosition[]> {
  const rows: MarginPosition[] = [];
  while (true) {
    const { data, error } = await supabase.from('margin_positions').select('*').eq('user_id', userId)
      .order('opened_at', { ascending: false }).order('id').range(rows.length, rows.length + 499);
    if (error) throw new Error('No se pudieron cargar las posiciones de margen.', { cause: error });
    rows.push(...data as MarginPosition[]);
    if (data.length < 500) return rows;
  }
}
