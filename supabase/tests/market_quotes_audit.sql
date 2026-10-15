-- Auditoría transaccional: revierte usuarios, operaciones y precios de prueba.
begin;
select set_config('bullvest.market_user', gen_random_uuid()::text, true);
select set_config('bullvest.market_asset', id::text, true) from public.assets where ticker = 'AAPL';
select set_config('bullvest.market_sell_request', gen_random_uuid()::text, true);
insert into auth.users(id,email) values(current_setting('bullvest.market_user')::uuid,
                                       current_setting('bullvest.market_user') || '@market-audit.invalid');
update public.profiles set fictional_balance = 1000 where id = current_setting('bullvest.market_user')::uuid;
update public.assets set current_price = 100, sell_price = 99, price_updated_at = now(), is_tradable = true,
                         change_24h = 12.34, change_30d = -4.56, volatility_1d = 2.34
where id = current_setting('bullvest.market_asset')::uuid;

set local role service_role;
do $$
declare
  u uuid := current_setting('bullvest.market_user')::uuid;
  a uuid := current_setting('bullvest.market_asset')::uuid;
  sell_request uuid := current_setting('bullvest.market_sell_request')::uuid;
  receipt record;
  original_id uuid;
  blocked boolean;
begin
  select * into receipt from public.execute_trade(u,a,'BUY',2,100,gen_random_uuid());
  if receipt.resulting_balance <> 800 or receipt.position_quantity <> 2 then
    raise exception 'BUY must execute at current_price';
  end if;
  select * into receipt from public.execute_trade(u,a,'SELL',1,99,sell_request);
  original_id := receipt.transaction_id;
  if receipt.resulting_balance <> 899 or receipt.position_quantity <> 1
     or not exists(select 1 from public.transactions where id = original_id
                   and execution_price = 99 and total_value = 99 and realized_pnl = -1) then
    raise exception 'SELL must execute, credit balance and calculate P/L at sell_price';
  end if;
  update public.assets set price_updated_at = now() - interval '3 minutes' where id = a;
  select * into receipt from public.execute_trade(u,a,'SELL',1,99,sell_request);
  if receipt.transaction_id <> original_id or receipt.resulting_balance <> 899
     or (select count(*) from public.transactions where user_id = u) <> 2 then
    raise exception 'Idempotent retry changed fill or duplicated trade';
  end if;
  blocked := false;
  begin perform public.execute_trade(u,a,'SELL',1,99,gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'QUOTE_STALE_OR_UNAVAILABLE' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Stale quote accepted'; end if;
  update public.assets set price_updated_at = now() where id = a;
  blocked := false;
  begin perform public.execute_trade(u,a,'SELL',1,100,gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'QUOTE_CHANGED_RETRY_REQUIRED' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'SELL accepted ask instead of bid'; end if;
  blocked := false;
  begin perform public.execute_trade(u,a,'SELL',2,99,gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'INSUFFICIENT_ASSET_QUANTITY' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Oversell accepted'; end if;
  update public.assets set sell_price = null where id = a;
  blocked := false;
  begin perform public.execute_trade(u,a,'SELL',1,99,gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'QUOTE_STALE_OR_UNAVAILABLE' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Missing bid substituted with ask'; end if;
  update public.assets set sell_price = 101 where id = a;
  blocked := false;
  begin perform public.execute_trade(u,a,'SELL',1,101,gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'QUOTE_STALE_OR_UNAVAILABLE' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Crossed bid accepted'; end if;
  update public.assets set sell_price = 99 where id = a;
  perform public.refresh_asset_prices();
  if not exists(select 1 from public.assets where id = a
    and current_price between 99 and 101 and sell_price > 0
    and abs(sell_price - current_price * 0.99) <= 0.00000001
    and price_updated_at = now() and price_source = 'simulated'
    and change_24h = 12.34 and change_30d = -4.56 and volatility_1d = 2.34) then
    raise exception 'Refresh lost spread, timestamp or historical metrics';
  end if;
  update public.assets set current_price = 0.000002, sell_price = 0.0000018 where id = a;
  perform public.refresh_asset_prices();
  if not exists(select 1 from public.assets where id = a and sell_price > 0 and sell_price <= current_price) then
    raise exception 'Small crypto bid rounded away';
  end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('bullvest.market_user'), true);
set local role authenticated;
do $$
begin
  if not exists(select 1 from public.assets where category is not null)
     or (select count(*) from public.transactions) <> 2
     or (select total_quantity from public.portfolios) <> 1 then
    raise exception 'Authenticated catalog/progress read failed';
  end if;
  if has_function_privilege('authenticated','public.execute_trade(uuid,uuid,text,numeric,numeric,uuid)','EXECUTE')
     or has_function_privilege('anon','public.execute_trade(uuid,uuid,text,numeric,numeric,uuid)','EXECUTE')
     or has_table_privilege('authenticated','public.assets','UPDATE') then
    raise exception 'Client can alter trusted quotes or execute privileged trade RPC';
  end if;
end;
$$;
reset role;
rollback;
select 'PASS: bid/ask execution, balances, P/L, holdings, stale/invalid quotes, idempotency, spread refresh, precision, RLS and grants; rolled back' as audit_result;
