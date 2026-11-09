// Pure Twelve Data parser. Never infer a market tick from the time of fetch.
export type Candle1m = {
  open_at: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type CandleResult =
  | { ok: true; candles: Candle1m[] }
  | { ok: false; code: 'PROVIDER_ERROR' | 'SYMBOL_MISMATCH' | 'INVALID_RESPONSE' | 'NO_VALID_CANDLES' };

function parseMinuteUTC(value: unknown): string | null {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/.test(value)) return null;
  const iso = value.replace(' ', 'T') + 'Z';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value.replace(' ', 'T') + '.000Z') return null;
  return new Date(ms).toISOString();
}

function number(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value))) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1_000_000_000_000 ? n : null;
}

export function parseTwelveDataCandles(body: unknown, expectedSymbol: string): CandleResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'INVALID_RESPONSE' };
  }
  const value = body as Record<string, unknown>;
  if (value.status === 'error') return { ok: false, code: 'PROVIDER_ERROR' };
  const meta = value.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) ||
    (meta as { symbol?: unknown }).symbol !== expectedSymbol) {
    return { ok: false, code: 'SYMBOL_MISMATCH' };
  }
  if (!Array.isArray(value.values) || value.values.length > 200) {
    return { ok: false, code: 'INVALID_RESPONSE' };
  }

  const parsed = new Map<string, Candle1m>();
  for (const item of value.values) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const time = parseMinuteUTC(row.datetime);
    const open = number(row.open);
    const high = number(row.high);
    const low = number(row.low);
    const close = number(row.close);
    if (!time || open === null || high === null || low === null || close === null ||
      high < Math.max(open, low, close) || low > Math.min(open, high, close)) continue;
    parsed.set(time, { open_at: time, open, high, low, close });
  }

  const candles = [...parsed.values()].sort((a, b) => a.open_at.localeCompare(b.open_at));
  return candles.length ? { ok: true, candles } : { ok: false, code: 'NO_VALID_CANDLES' };
}
