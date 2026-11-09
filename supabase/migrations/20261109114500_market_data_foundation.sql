-- BullVest market-data foundation.
-- Additive, backwards-compatible, and NOT authorized for public real-market display.
-- All market data staging tables are server-only. No Basic-tier prices are seeded.
begin;

create table public.market_data_control (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  provider text not null default 'twelve_data' check (provider = 'twelve_data'),
  stage text not null default 'simulation' check (stage in ('simulation', 'licensed_shadow', 'licensed_public')),
  license_reference text,
  storage_approved boolean not null default false,
  external_display_approved boolean not null default false,
  live_execution_approved boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint licensed_stage_guard check (
    (stage = 'simulation' and not live_execution_approved and not external_display_approved)
    or (stage = 'licensed_shadow' and license_reference is not null
      and storage_approved and not live_execution_approved and not external_display_approved)
    or (stage = 'licensed_public' and license_reference is not null
      and storage_approved and external_display_approved)
  ),
  constraint execution_requires_external_license check (
    not live_execution_approved or
    (stage = 'licensed_public' and external_display_approved and license_reference is not null)
  )
);

insert into public.market_data_control(singleton_id) values (1) on conflict do nothing;

-- A source symbol is NOT necessarily the same instrument as a CFD with the
-- same ticker. Each mapping must be verified before enabling ingestion.
create table public.market_data_instruments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid unique references public.assets(id) on delete set null,
  provider text not null default 'twelve_data' check (provider = 'twelve_data'),
  provider_symbol text not null check (
    length(provider_symbol) between 1 and 40 and provider_symbol = upper(provider_symbol)
  ),
  provider_exchange text not null default '',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  instrument_type text not null default 'stock' check (
    instrument_type in ('stock', 'etf', 'index', 'forex', 'crypto', 'commodity')
  ),
  libertex_code text,
  libertex_name text,
  mapping_status text not null default 'unverified'
    check (mapping_status in ('unverified', 'verified', 'unavailable', 'ambiguous')),
  is_enabled boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enabled_mapping_requires_review check (
    not is_enabled or (mapping_status = 'verified' and verified_at is not null)
  ),
  unique(provider, provider_symbol, provider_exchange)
);
create index market_data_instruments_enabled_idx
  on public.market_data_instruments(provider, instrument_type) where is_enabled;

-- Licensed-only storage. Do not populate with the free Basic plan without
-- written confirmation that the applicable retention/caching is permitted.
create table public.market_data_candles (
  instrument_id uuid not null references public.market_data_instruments(id) on delete cascade,
  interval text not null check (interval in ('1min', '5min', '15min', '1h', '1day')),
  open_at timestamptz not null,
  open numeric(28,10) not null check (open > 0),
  high numeric(28,10) not null check (high > 0),
  low numeric(28,10) not null check (low > 0),
  close numeric(28,10) not null check (close > 0),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day'),
  primary key (instrument_id, interval, open_at),
  constraint valid_market_candle check (
    high >= greatest(open, close, low) and low <= least(open, close, high)
  ),
  constraint candle_expiry_after_open check(expires_at > open_at)
);
create index market_data_candles_expiry_idx on public.market_data_candles(expires_at);

-- Exchange timestamp and network arrival are distinct: a Friday close received
-- on Monday MUST NOT count as a fresh executable price.
create table public.market_data_quotes (
  instrument_id uuid primary key references public.market_data_instruments(id) on delete cascade,
  last_trade_price numeric(28,10) not null check(last_trade_price > 0),
  exchange_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null default 'twelve_data',
  -- Raw exchange last price, NOT a bid or an ask.
  quote_kind text not null default 'last' check (quote_kind = 'last')
);

-- Non-sensitive operational metadata; never store provider credentials,
-- unredacted API errors, or raw provider response bodies here.
create table public.market_data_sync_runs (
  id uuid primary key default gen_random_uuid(),
  invoked_at timestamptz not null default now(),
  completed_at timestamptz,
  requested_count smallint not null default 0 check (requested_count between 0 and 8),
  succeeded_count smallint not null default 0 check (succeeded_count between 0 and 8),
  failed_count smallint not null default 0 check (failed_count between 0 and 8),
  code text not null default 'STARTED' check(code ~ '^[A-Z_]{2,80}$'),
  storage_performed boolean not null default false
);

-- Every staging table denies browser access, including signed-in users.
alter table public.market_data_control enable row level security;
alter table public.market_data_instruments enable row level security;
alter table public.market_data_candles enable row level security;
alter table public.market_data_quotes enable row level security;
alter table public.market_data_sync_runs enable row level security;

revoke all on public.market_data_control from public, anon, authenticated;
revoke all on public.market_data_instruments from public, anon, authenticated;
revoke all on public.market_data_candles from public, anon, authenticated;
revoke all on public.market_data_quotes from public, anon, authenticated;
revoke all on public.market_data_sync_runs from public, anon, authenticated;
grant all on public.market_data_control to service_role;
grant all on public.market_data_instruments to service_role;
grant all on public.market_data_candles to service_role;
grant all on public.market_data_quotes to service_role;
grant all on public.market_data_sync_runs to service_role;

-- Candidate stock mappings from BullVest's existing catalog.
-- None is marked verified/enabled or associated with a Libertex CFD.
insert into public.market_data_instruments (
  asset_id, provider_symbol, instrument_type, currency, mapping_status, is_enabled
)
select id, ticker, 'stock', currency, 'unverified', false
from public.assets
where asset_type = 'stock' and ticker in
  ('AAPL', 'AMZN', 'GME', 'MRNA', 'MSFT', 'NVDA', 'ORCL', 'TSLA', 'TTD')
on conflict (provider, provider_symbol, provider_exchange) do nothing;

-- Preserve the simulator, but stop overwriting any source-verified live rows
-- if a licensed feed is enabled in a later, separately reviewed rollout.
create or replace function public.refresh_asset_prices()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare refreshed_count integer;
begin
  with moves as materialized (
    select id, 0.99::numeric + random()::numeric * 0.02 as factor
    from public.assets
    where price_source = 'simulated'
  )
  update public.assets a
  set current_price = greatest(
        0.00000001::numeric, round(a.current_price * m.factor, 8)
      ),
      sell_price = case when a.sell_price > 0
        then greatest(0.00000001::numeric, round(a.sell_price * m.factor, 8))
        else a.sell_price end,
      price_updated_at = now(),
      updated_at = now(),
      price_source = 'simulated',
      quote_is_delayed = false
  from moves m
  where m.id = a.id and a.price_source = 'simulated';

  get diagnostics refreshed_count = row_count;
  return refreshed_count;
end;
$function$;
revoke all on function public.refresh_asset_prices()
  from public, anon, authenticated;
grant execute on function public.refresh_asset_prices() to service_role;

commit;
