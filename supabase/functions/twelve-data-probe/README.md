# Twelve Data — Basic plan: private integration probe

This function **does not** connect BullVest's production market feed. It verifies a single
Twelve Data AAPL 1-minute OHLC request using a **server-side** API secret, without changing
`public.assets`, prices, portfolio balances, or the current simulator.

## Configure (user action)

1. Copy your API key from https://twelvedata.com/account/api-keys.
2. Open https://supabase.com/dashboard/project/zgycwhxwpxbqtivgssml/functions/secrets
   (if redirected, navigate Edge Functions → Secrets).
3. Add `TWELVE_DATA_API_KEY` as the **Key**, and the API key as the **Value**.
   Save. Never put this key in Vite's `VITE_*`, `.env` tracked files, GitHub issues,
   GitHub repository secrets intended for client use, or a chat.
4. The private Edge Function is named `twelve-data-probe`. It must be invoked with
   the **server** `apikey` for the Supabase project (not the provider key). It uses
   `withSupabase({ auth: 'secret' })` and deploys with `verify_jwt=false`;
   its handler validates the Supabase server key itself. Do not invoke from React.
5. A successful request returns `provider`, `ticker: AAPL`, `interval: 1min`,
   up to five OHLC bars, and `assetsModified: 0`.

The function intentionally takes **no symbol input**, so callers cannot spend credits
on arbitrary tickers. Each invocation consumes the endpoint's credits. No cron is
installed and no automatic calls are made.

## Basic plan constraints

- 8 API credits/min and 800/day (check your account dashboard).
- Eight *trial* WebSocket credits are not a production-grade market stream.
- The Basic license covers internal non-display use; verify **external display**
  licensing before showing a real-data graph to BullVest users.
- Twelve Data does not supply real Bid/Ask via its WebSocket price stream.
- Map tickers carefully: `BTCUSD → BTC/USD`, `EURUSD → EUR/USD`;
  stock `AAPL` uses its direct ticker. CFD labels (NAS100, GER40, etc.) are
  **not** assured to match exchange indexes or broker CFD prices.
- Historical bar timestamps must not be replaced by `NOW()` and called live.
  When an exchange is closed, the historical last close is old, not a fresh quote.

## Architecture after confirmation and license upgrade

Plan: dedicated ticker mappings → durable quote ingestion (not per-visitor requests) →
PostgreSQL quote history / OHLC and snapshots → Supabase Realtime → React candlesticks →
server-validated **paper-only** orders. Keep the current simulated feed active until
the replacement is verified and rollback is ready.

## Tests

```sh
deno check --config supabase/functions/twelve-data-probe/deno.json supabase/functions/twelve-data-probe/index.ts
```

## Security

No writes; no user-facing API. API key is transmitted to Twelve Data in the
`Authorization` header, not placed in query URLs or response bodies. Failure
responses contain only internal error codes. Do not log secrets.
