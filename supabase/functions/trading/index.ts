import { withSupabase } from '@supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUANTITY_RE = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;

interface TradeRequest {
  action: 'execute_trade';
  asset_id: string;
  order_type: 'BUY' | 'SELL';
  quantity: string;
  request_id: string;
}

interface ReloadRequest {
  action: 'use_life_reload';
}

type TradingRequest = TradeRequest | ReloadRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRequest(value: unknown): TradingRequest | null {
  if (!isRecord(value)) return null;
  if (value.action === 'use_life_reload') return { action: 'use_life_reload' };
  if (
    value.action !== 'execute_trade' ||
    typeof value.asset_id !== 'string' || !UUID_RE.test(value.asset_id) ||
    typeof value.request_id !== 'string' || !UUID_RE.test(value.request_id) ||
    (value.order_type !== 'BUY' && value.order_type !== 'SELL') ||
    typeof value.quantity !== 'string' ||
    !QUANTITY_RE.test(value.quantity) ||
    Number(value.quantity) <= 0
  ) return null;

  return {
    action: 'execute_trade',
    asset_id: value.asset_id,
    order_type: value.order_type,
    quantity: value.quantity,
    request_id: value.request_id,
  };
}

const KNOWN_ERRORS = new Set([
  'INVALID_QUANTITY_OR_PRICE', 'INVALID_TRANSACTION_TYPE',
  'INSUFFICIENT_FICTIONAL_FUNDS', 'INSUFFICIENT_ASSET_QUANTITY',
  'QUOTE_STALE_OR_UNAVAILABLE', 'QUOTE_CHANGED_RETRY_REQUIRED',
  'ASSET_NOT_TRADABLE', 'ASSET_NOT_FOUND', 'PROFILE_NOT_FOUND',
  'ORDER_BELOW_ONE_CENT', 'AVERAGE_PRICE_BELOW_PRECISION',
  'CLOSE_ALL_POSITIONS_BEFORE_RELOAD',
  'RELOAD_ALLOWED_ONLY_WITH_100_OR_LESS',
  'NO_FREE_LIVES_REMAINING',
  'REQUEST_ID_REUSED_WITH_DIFFERENT_ORDER',
]);

function fail(status: number, code: string): Response {
  return Response.json({ code }, { status });
}

function rpcErrorCode(message: string): string {
  const code = message.trim();
  return KNOWN_ERRORS.has(code) ? code : 'SERVER_ERROR';
}

// La función necesita un JWT de usuario real; withSupabase verifica
// la identidad antes de permitir usar ctx.supabaseAdmin.
export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
    const userId = ctx.userClaims?.id;
    if (!userId) return fail(401, 'UNAUTHORIZED');

    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > 4096) return fail(413, 'PAYLOAD_TOO_LARGE');

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return fail(400, 'INVALID_JSON');
    }

    const parsed = parseRequest(payload);
    if (!parsed) return fail(400, 'INVALID_ORDER');

    if (parsed.action === 'use_life_reload') {
      const { data, error } = await ctx.supabaseAdmin.rpc('use_life_reload', {
        p_user_id: userId,
      });
      if (error) return fail(400, rpcErrorCode(error.message));
      const result = data?.[0];
      if (!result) return fail(500, 'SERVER_ERROR');
      return Response.json({
        action: 'use_life_reload',
        reload_id: result.reload_id,
        resulting_balance: result.resulting_balance,
        remaining_lives: result.remaining_lives,
      });
    }

    // Responder a reintentos ya confirmados aunque la cotización haya caducado.
    // La restricción UNIQUE(user_id, client_request_id) evita operaciones dobles.
    const { data: previous, error: previousError } = await ctx.supabaseAdmin
      .from('transactions')
      .select('id, asset_id, transaction_type, quantity, balance_after, position_after')
      .eq('user_id', userId)
      .eq('client_request_id', parsed.request_id)
      .maybeSingle();
    if (previousError) return fail(500, 'SERVER_ERROR');
    if (previous) {
      if (
        previous.asset_id !== parsed.asset_id ||
        previous.transaction_type !== parsed.order_type ||
        Number(previous.quantity) !== Number(parsed.quantity)
      ) return fail(409, 'REQUEST_ID_REUSED_WITH_DIFFERENT_ORDER');

      return Response.json({
        action: 'execute_trade',
        transaction_id: previous.id,
        resulting_balance: previous.balance_after,
        position_quantity: previous.position_after,
      });
    }

    // IMPORTANTE: los precios llegan del catálogo mantenido por un proceso
    // de ingesta autenticado, NUNCA del payload del navegador.
    const { data: quote, error: quoteError } = await ctx.supabaseAdmin
      .from('assets')
      .select('id, current_price, price_updated_at, currency, is_tradable')
      .eq('id', parsed.asset_id)
      .maybeSingle();

    if (quoteError) return fail(500, 'SERVER_ERROR');
    if (!quote) return fail(404, 'ASSET_NOT_FOUND');
    if (!quote.is_tradable || quote.currency !== 'USD') return fail(400, 'ASSET_NOT_TRADABLE');

    const quoteTimestamp = quote.price_updated_at
      ? Date.parse(quote.price_updated_at)
      : Number.NaN;
    const now = Date.now();
    if (
      !Number.isFinite(quoteTimestamp) ||
      now - quoteTimestamp > 120_000 ||
      quoteTimestamp - now > 5_000
    ) return fail(409, 'QUOTE_STALE_OR_UNAVAILABLE');

    // La RPC vuelve a comprobar cotización, saldo y cantidad bajo bloqueos SQL.
    const { data, error } = await ctx.supabaseAdmin.rpc('execute_trade', {
      p_user_id: userId,
      p_asset_id: parsed.asset_id,
      p_type: parsed.order_type,
      p_quantity: parsed.quantity,
      p_price: quote.current_price,
      p_request_id: parsed.request_id,
    });

    if (error) return fail(409, rpcErrorCode(error.message));
    const result = data?.[0];
    if (!result) return fail(500, 'SERVER_ERROR');
    return Response.json({
      action: 'execute_trade',
      transaction_id: result.transaction_id,
      resulting_balance: result.resulting_balance,
      position_quantity: result.position_quantity,
    });
  }),
};
