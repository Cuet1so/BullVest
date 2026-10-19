-- Exercise actual BUY/SELL RPCs for every catalog asset. All audit changes,
-- including the temporary account, trades and quote timestamps, are rolled back.
begin;
select set_config('bullvest.unlock_user', gen_random_uuid()::text, true);
insert into auth.users(id, email) values (current_setting('bullvest.unlock_user')::uuid,
  current_setting('bullvest.unlock_user') || '@unlock-audit.invalid');
update public.profiles set fictional_balance = 1000000000
where id = current_setting('bullvest.unlock_user')::uuid;

do $$
begin
  if not exists(select 1 from public.assets) then raise exception 'EMPTY_CATALOG'; end if;
  if exists(select 1 from public.assets where is_tradable is not true
    or currency <> 'USD' or current_price is null or current_price <= 0
    or current_price::text in ('NaN','Infinity','-Infinity')
    or sell_price is null or sell_price <= 0 or sell_price > current_price
    or sell_price::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'CATALOG_STILL_BLOCKED';
  end if;
end;
$$;

-- Isolate the audit from elapsed time since migration; never persist this refresh.
update public.assets set price_updated_at = now();
set local role service_role;
do $$
declare a record; units numeric; buy_receipt record; sell_receipt record;
  u uuid := current_setting('bullvest.unlock_user')::uuid;
  tested integer := 0;
begin
  for a in select * from public.assets order by id loop
    -- Ensure both sides clear the one-cent minimum, including tiny crypto.
    units := greatest(1::numeric, ceil(0.02 / a.sell_price));
    select * into buy_receipt from public.execute_trade(u, a.id, 'BUY', units,
      a.current_price, gen_random_uuid());
    select * into sell_receipt from public.execute_trade(u, a.id, 'SELL', units,
      a.sell_price, gen_random_uuid());
    if buy_receipt.position_quantity <> units or sell_receipt.position_quantity <> 0 then
      raise exception 'INVALID_ROUND_TRIP: %', a.ticker;
    end if;
    tested := tested + 1;
  end loop;
  if (select count(*) from public.transactions where user_id = u) <> tested * 2 then
    raise exception 'MISSING_TRADES';
  end if;
  raise notice 'BUY and SELL passed for all % assets', tested;
end;
$$;
reset role;
rollback;
