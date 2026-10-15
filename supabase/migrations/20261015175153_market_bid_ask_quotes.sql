begin;

-- Registrar las columnas añadidas al catálogo en la nube sin reemplazar sus datos.
alter table public.assets
  add column if not exists category text default 'stocks',
  add column if not exists sell_price numeric(20,8),
  add column if not exists change_24h numeric(6,2) default 0,
  add column if not exists change_30d numeric(6,2) default 0,
  add column if not exists volatility_1d numeric(6,2) default 0,
  add column if not exists high_24h numeric(12,4),
  add column if not exists low_24h numeric(12,4),
  add column if not exists is_popular boolean default false,
  add column if not exists is_meme boolean default false,
  add column if not exists has_options boolean default true,
  add column if not exists signal_type text default 'NEUTRAL';

-- Evitar que el refresco redondee a cero un bid pequeño de criptodivisas.
alter table public.assets alter column sell_price type numeric(20,8);

create or replace function public.refresh_asset_prices()
returns integer language plpgsql security definer set search_path = '' as $$
declare refreshed_count integer;
begin
  -- Un único factor por activo mantiene el spread relativo. Los indicadores
  -- históricos y los flags del catálogo no se inventan a partir de este tick.
  with moves as materialized (
    select id, 0.99::numeric + random()::numeric * 0.02 as factor from public.assets
  )
  update public.assets a
  set current_price = greatest(0.00000001::numeric, round(a.current_price * m.factor, 8)),
      sell_price = case when a.sell_price > 0
        then greatest(0.00000001::numeric, round(a.sell_price * m.factor, 8))
        else a.sell_price end,
      price_updated_at = now(), updated_at = now(),
      price_source = 'simulated', quote_is_delayed = false
  from moves m where m.id = a.id;
  get diagnostics refreshed_count = row_count;
  return refreshed_count;
end;
$$;
revoke all on function public.refresh_asset_prices() from public, anon, authenticated;
grant execute on function public.refresh_asset_prices() to service_role;

create or replace function public.execute_trade(
  p_user_id uuid, p_asset_id uuid, p_type text, p_quantity numeric,
  p_price numeric, p_request_id uuid default null
)
returns table(transaction_id uuid, resulting_balance numeric, position_quantity numeric)
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles%rowtype;
  v_asset public.assets%rowtype;
  v_position public.portfolios%rowtype;
  v_previous public.transactions%rowtype;
  v_total numeric(15,2);
  v_balance numeric(15,2);
  v_position_qty numeric(20,8);
  v_average_price numeric(20,8);
  v_realized_pnl numeric(15,2);
  v_transaction_id uuid;
  v_execution_price numeric;
begin
  if p_user_id is null or p_asset_id is null or p_request_id is null then
    raise exception 'USER_ASSET_AND_REQUEST_IDS_REQUIRED';
  end if;
  if p_type is null or p_type not in ('BUY', 'SELL') then
    raise exception 'INVALID_TRANSACTION_TYPE';
  end if;
  if p_quantity is null or p_price is null
     or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
     or p_price::text in ('NaN', 'Infinity', '-Infinity')
     or p_quantity <= 0 or p_price <= 0
     or p_quantity <> round(p_quantity, 8) or p_price <> round(p_price, 8) then
    raise exception 'INVALID_QUANTITY_OR_PRICE';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  -- Idempotencia antes de comprobar frescura: no repetir un fill ya confirmado.
  select * into v_previous from public.transactions
  where user_id = p_user_id and client_request_id = p_request_id;
  if found then
    if v_previous.asset_id <> p_asset_id or v_previous.transaction_type <> p_type
       or v_previous.quantity <> p_quantity then
      raise exception 'REQUEST_ID_REUSED_WITH_DIFFERENT_ORDER';
    end if;
    return query select v_previous.id, v_previous.balance_after, v_previous.position_after;
    return;
  end if;

  select * into v_asset from public.assets where id = p_asset_id for share;
  if not found then raise exception 'ASSET_NOT_FOUND'; end if;
  if not v_asset.is_tradable or v_asset.currency <> 'USD' then
    raise exception 'ASSET_NOT_TRADABLE';
  end if;
  if v_asset.price_updated_at is null
     or v_asset.price_updated_at < now() - interval '120 seconds'
     or v_asset.price_updated_at > now() + interval '5 seconds' then
    raise exception 'QUOTE_STALE_OR_UNAVAILABLE';
  end if;
  v_execution_price := case when p_type = 'BUY' then v_asset.current_price else v_asset.sell_price end;
  if v_execution_price is null or v_execution_price <= 0
     or v_execution_price::text in ('NaN', 'Infinity', '-Infinity')
     or (p_type = 'SELL' and v_execution_price > v_asset.current_price) then
    raise exception 'QUOTE_STALE_OR_UNAVAILABLE';
  end if;
  if p_price <> v_execution_price then raise exception 'QUOTE_CHANGED_RETRY_REQUIRED'; end if;

  v_total := round(p_quantity * v_execution_price, 2);
  if v_total <= 0 then raise exception 'ORDER_BELOW_ONE_CENT'; end if;
  select * into v_position from public.portfolios
  where user_id = p_user_id and asset_id = p_asset_id for update;
  if p_type = 'BUY' then
    if v_profile.fictional_balance < v_total then raise exception 'INSUFFICIENT_FICTIONAL_FUNDS'; end if;
    v_position_qty := coalesce(v_position.total_quantity, 0) + p_quantity;
    v_average_price := round(
      (coalesce(v_position.total_quantity, 0) * coalesce(v_position.average_buy_price, 0)
        + p_quantity * v_execution_price) / v_position_qty, 8);
    if v_average_price <= 0 then raise exception 'AVERAGE_PRICE_BELOW_PRECISION'; end if;
    insert into public.portfolios(user_id, asset_id, total_quantity, average_buy_price)
    values(p_user_id, p_asset_id, v_position_qty, v_average_price)
    on conflict(user_id, asset_id) do update set
      total_quantity = excluded.total_quantity, average_buy_price = excluded.average_buy_price;
    v_balance := v_profile.fictional_balance - v_total;
    v_realized_pnl := null;
  else
    if v_position.id is null or v_position.total_quantity < p_quantity then
      raise exception 'INSUFFICIENT_ASSET_QUANTITY';
    end if;
    v_position_qty := v_position.total_quantity - p_quantity;
    v_realized_pnl := round((v_execution_price - v_position.average_buy_price) * p_quantity, 2);
    if v_position_qty = 0 then delete from public.portfolios where id = v_position.id;
    else update public.portfolios set total_quantity = v_position_qty where id = v_position.id;
    end if;
    v_balance := v_profile.fictional_balance + v_total;
  end if;
  update public.profiles set fictional_balance = v_balance where id = p_user_id;
  insert into public.transactions(
    client_request_id, user_id, asset_id, transaction_type, quantity, execution_price,
    total_value, balance_after, position_after, realized_pnl
  ) values(p_request_id, p_user_id, p_asset_id, p_type, p_quantity, v_execution_price,
           v_total, v_balance, v_position_qty, v_realized_pnl)
  returning id into v_transaction_id;
  return query select v_transaction_id, v_balance, v_position_qty;
end;
$$;
revoke all on function public.execute_trade(uuid,uuid,text,numeric,numeric,uuid) from public, anon, authenticated;
grant execute on function public.execute_trade(uuid,uuid,text,numeric,numeric,uuid) to service_role;
commit;
