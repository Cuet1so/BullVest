-- Ejecutar completo: usuarios, activos y operaciones de prueba se revierten.
begin;
select set_config('bullvest.audit_user_a', gen_random_uuid()::text, true);
select set_config('bullvest.audit_user_b', gen_random_uuid()::text, true);
select set_config('bullvest.audit_asset', gen_random_uuid()::text, true);

insert into auth.users(id, email)
select current_setting(key)::uuid, current_setting(key) || '@dashboard-audit.invalid'
from unnest(array['bullvest.audit_user_a', 'bullvest.audit_user_b']) as key;
update public.profiles set fictional_balance = 1000
where id in (current_setting('bullvest.audit_user_a')::uuid, current_setting('bullvest.audit_user_b')::uuid);
insert into public.assets(id, ticker, name, asset_type, current_price, price_updated_at)
values (current_setting('bullvest.audit_asset')::uuid,
        'AUDIT' || upper(left(replace(current_setting('bullvest.audit_asset'), '-', ''), 10)),
        'Dashboard audit', 'STOCK', 20, now());
insert into public.portfolios(user_id, asset_id, total_quantity, average_buy_price)
select current_setting(key)::uuid, current_setting('bullvest.audit_asset')::uuid, 2, 15
from unnest(array['bullvest.audit_user_a', 'bullvest.audit_user_b']) as key;
insert into public.transactions(user_id, asset_id, transaction_type, quantity, execution_price,
                                total_value, balance_after, position_after, client_request_id, executed_at)
select current_setting(key)::uuid, current_setting('bullvest.audit_asset')::uuid,
       'BUY', 1, 20, 20, 1000, 2, gen_random_uuid(), now() - n * interval '1 minute'
from unnest(array['bullvest.audit_user_a', 'bullvest.audit_user_b']) as key
cross join generate_series(1, 6) n;

select set_config('request.jwt.claim.sub', current_setting('bullvest.audit_user_a'), true);
set local role authenticated;
do $$
declare
  blocked boolean;
begin
  if (select count(*) from public.profiles) <> 1
     or (select count(*) from public.portfolios) <> 1
     or (select count(*) from public.transactions) <> 6 then
    raise exception 'RLS did not isolate account A';
  end if;
  if (select total_equity from public.v_account_equity) <> 1040 then
    raise exception 'Incorrect equity under RLS';
  end if;
  if (select sum(h.total_quantity * a.current_price) from public.portfolios h
      join public.assets a on a.id = h.asset_id) <> 40 then
    raise exception 'Incorrect portfolio join under RLS';
  end if;
  if (select count(*) from (select t.id from public.transactions t join public.assets a on a.id=t.asset_id
      order by t.executed_at desc, t.id desc limit 5) recent) <> 5 then
    raise exception 'Incorrect recent transactions';
  end if;
  insert into public.pro_upgrade_requests(user_id) values (auth.uid());
  blocked := false;
  begin
    insert into public.pro_upgrade_requests(user_id) values (current_setting('bullvest.audit_user_b')::uuid);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Cross-account Pro request accepted'; end if;
  blocked := false;
  begin
    update public.profiles set role = 'pro' where id = auth.uid();
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Client can self-upgrade to Pro'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('bullvest.audit_user_b'), true);
do $$
begin
  if exists(select 1 from public.pro_upgrade_requests)
     or (select count(*) from public.profiles) <> 1
     or (select id from public.profiles) <> auth.uid() then
    raise exception 'Account B can see account A data';
  end if;
end;
$$;
reset role;
rollback;
select 'PASS: two-user RLS, equity, portfolio joins, latest five transactions and Pro requests; rolled back' as audit_result;
