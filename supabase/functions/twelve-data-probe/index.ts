import { withSupabase } from '@supabase/server';

// Diagnóstico INTERNO: no modifica assets, no publica datos a usuarios.
type TwelveDataBar = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
};

type TwelveDataResponse = {
  status?: string;
  code?: number;
  message?: string;
  meta?: { symbol?: string; interval?: string; timezone?: string };
  values?: unknown;
};

function validBar(value: unknown): value is TwelveDataBar {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const fields = ['open', 'high', 'low', 'close'] as const;
  return typeof row.datetime === 'string' &&
    fields.every((field) =>
      typeof row[field] === 'string' &&
      row[field].trim() !== '' &&
      Number.isFinite(Number(row[field])) &&
      Number(row[field]) > 0);
}

const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

export default {
  // Only calls carrying Supabase's server-side secret key can execute this.
  fetch: withSupabase({ auth: 'secret' }, async (request) => {
    if (request.method !== 'POST') {
      return Response.json({ code: 'METHOD_NOT_ALLOWED' }, {
        status: 405,
        headers: { ...headers, Allow: 'POST' },
      });
    }

    const key = Deno.env.get('TWELVE_DATA_API_KEY')?.trim();
    if (!key) {
      return Response.json({ code: 'TWELVE_DATA_KEY_NOT_CONFIGURED' }, {
        status: 503,
        headers,
      });
    }

    // One symbol, one endpoint, one credit under the usual Twelve Data weights.
    // AAPL is already present in BullVest's catalog.
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', 'AAPL');
    url.searchParams.set('interval', '1min');
    url.searchParams.set('outputsize', '5');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('format', 'JSON');

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `apikey ${key}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      return Response.json({ code: 'TWELVE_DATA_UNREACHABLE' }, {
        status: 503,
        headers,
      });
    }

    let body: TwelveDataResponse;
    try {
      body = await upstream.json() as TwelveDataResponse;
    } catch {
      return Response.json({ code: 'TWELVE_DATA_INVALID_JSON' }, {
        status: 502,
        headers,
      });
    }

    if (!body || typeof body !== 'object') {
      return Response.json({ code: 'TWELVE_DATA_INVALID_RESPONSE' }, {
        status: 502,
        headers,
      });
    }

    if (upstream.status === 429 || body.code === 429) {
      return Response.json({ code: 'TWELVE_DATA_RATE_LIMITED' }, {
        status: 429,
        headers,
      });
    }

    if (!upstream.ok || body.status === 'error') {
      const providerCode = typeof body.code === 'number' ? body.code : upstream.status;
      return Response.json({
        code: 'TWELVE_DATA_PROVIDER_ERROR',
        providerCode,
        // Do not forward upstream messages, request URLs, or credentials.
      }, { status: 502, headers });
    }

    if (!Array.isArray(body.values)) {
      return Response.json({ code: 'TWELVE_DATA_MISSING_SERIES' }, {
        status: 502,
        headers,
      });
    }

    const bars = body.values.filter(validBar);
    if (bars.length === 0) {
      return Response.json({ code: 'TWELVE_DATA_NO_VALID_CANDLES' }, {
        status: 502,
        headers,
      });
    }

    const newest = [...bars].sort(
      (a, b) => b.datetime.localeCompare(a.datetime),
    )[0];

    // This is an OHLC bar time, NOT a quote received_at timestamp.
    // Do not use it to bypass BullVest's 120-second execution guard.
    return Response.json({
      mode: 'internal_license_probe_only',
      provider: 'Twelve Data',
      ticker: 'AAPL',
      interval: '1min',
      returnedBars: bars.length,
      latestBar: {
        datetime: newest.datetime,
        open: Number(newest.open),
        high: Number(newest.high),
        low: Number(newest.low),
        close: Number(newest.close),
      },
      assetsModified: 0,
    }, { headers });
  }),
};
