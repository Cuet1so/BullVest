import { withSupabase } from '@supabase/server';
import { parseTwelveDataCandles } from './provider.ts';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const MAX_SYMBOLS_PER_RUN = 5;
const OUTPUT_SIZE = 30;
const INTERVAL = '1min';

type MarketInstrument = {
  id: string;
  provider_symbol: string;
  provider_exchange: string;
};

function errorResponse(code: string, status: number) {
  return Response.json({ code, assetsModified: 0 }, { status, headers: HEADERS });
}

// Internal worker entrypoint only. Requires Supabase secret-key apikey;
// no direct frontend calls, no cron, no output of market prices to users.
export default {
  fetch: withSupabase({ auth: 'secret' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return Response.json({ code: 'METHOD_NOT_ALLOWED' }, {
        status: 405,
        headers: { ...HEADERS, Allow: 'POST' },
      });
    }

    const { data: control, error: controlError } = await ctx.supabaseAdmin
      .from('market_data_control')
      .select('stage,storage_approved,license_reference')
      .eq('singleton_id', 1)
      .single();
    if (controlError || !control) return errorResponse('CONFIG_UNAVAILABLE', 503);

    // Legal and operational kill switch. Nothing is fetched or cached on Basic.
    if (control.stage === 'simulation' || control.storage_approved !== true ||
      typeof control.license_reference !== 'string' || !control.license_reference.trim()) {
      return errorResponse('LICENSED_INGESTION_DISABLED', 423);
    }

    const key = Deno.env.get('TWELVE_DATA_API_KEY')?.trim();
    if (!key) return errorResponse('PROVIDER_KEY_NOT_CONFIGURED', 503);

    const { data: rows, error: listError } = await ctx.supabaseAdmin
      .from('market_data_instruments')
      .select('id,provider_symbol,provider_exchange')
      .eq('provider', 'twelve_data')
      .eq('mapping_status', 'verified')
      .eq('is_enabled', true)
      .order('provider_symbol', { ascending: true })
      .limit(MAX_SYMBOLS_PER_RUN);
    if (listError) return errorResponse('CATALOG_UNAVAILABLE', 503);

    const instruments = (rows ?? []) as MarketInstrument[];
    if (!instruments.length) return errorResponse('NO_VERIFIED_SYMBOLS', 412);

    const { data: reserved, error: reserveError } = await ctx.supabaseAdmin.rpc(
      'reserve_market_data_credits',
      { p_credits: instruments.length },
    );
    if (reserveError) return errorResponse('QUOTA_RESERVATION_FAILED', 503);
    if (reserved !== true) return errorResponse('BASIC_QUOTA_REACHED', 429);

    let succeeded = 0;
    let failed = 0;
    let limited = false;
    for (const instrument of instruments) {
      // Fail closed on provider or database errors. No retry loops/spikes.
      const url = new URL('https://api.twelvedata.com/time_series');
      url.searchParams.set('symbol', instrument.provider_symbol);
      if (instrument.provider_exchange) url.searchParams.set('exchange', instrument.provider_exchange);
      url.searchParams.set('interval', INTERVAL);
      url.searchParams.set('outputsize', String(OUTPUT_SIZE));
      url.searchParams.set('timezone', 'UTC');
      url.searchParams.set('format', 'JSON');

      try {
        const response = await fetch(url, {
          headers: {
            Authorization: 'apikey ' + key,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(9_000),
          redirect: 'error',
        });
        if (response.status === 429) {
          limited = true;
          failed++;
          break;
        }
        if (!response.ok) { failed++; continue; }
        const parsed = parseTwelveDataCandles(
          await response.json() as unknown,
          instrument.provider_symbol,
        );
        if (!parsed.ok) { failed++; continue; }

        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const candles = parsed.candles.map((candle) => ({
          instrument_id: instrument.id,
          interval: INTERVAL,
          ...candle,
          expires_at: expiry,
        }));
        const { error: storeError } = await ctx.supabaseAdmin
          .from('market_data_candles')
          .upsert(candles, { onConflict: 'instrument_id,interval,open_at' });

        if (storeError) { failed++; continue; }
        succeeded++;
      } catch {
        failed++;
      }
    }

    // Only counts/status: not raw market data or provider error details.
    await ctx.supabaseAdmin.from('market_data_sync_runs').insert({
      requested_count: instruments.length,
      succeeded_count: succeeded,
      failed_count: failed,
      completed_at: new Date().toISOString(),
      code: limited ? 'RATE_LIMITED' : failed ? 'PARTIAL_FAILURE' : 'COMPLETED',
      storage_performed: succeeded > 0,
    });

    // Reporting counters to a server-side operator is safe; do not return bars.
    return Response.json({
      code: limited ? 'RATE_LIMITED' : failed ? 'PARTIAL_FAILURE' : 'COMPLETED',
      requested: instruments.length,
      synced: succeeded,
      failed,
      interval: INTERVAL,
      assetsModified: 0,
      publicDataExposed: false,
    }, {
      status: limited ? 429 : failed ? 502 : 200,
      headers: HEADERS,
    });
  }),
};
