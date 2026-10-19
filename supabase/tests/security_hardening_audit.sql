-- Run after the migration. For a non-persistent rehearsal, insert the migration
-- body (without BEGIN/COMMIT) immediately after BEGIN below. Always rolls back.
begin;
set local statement_timeout = '30s';
do $$ declare f record; t text; c record; begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prosecdef and p.prokind='f'
      and n.nspname in ('public','private','academy_private','analytics_private')
      and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
  loop
    if has_function_privilege('anon',f.oid,'EXECUTE') then raise exception 'Anonymous function access: %',f.oid::regprocedure; end if;
    if exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=f.oid and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC function access'; end if;
  end loop;
  foreach t in array array['profiles','transactions','portfolios','user_academy_progress'] loop
    if not (select relrowsecurity from pg_class where oid=format('public.%I',t)::regclass) then raise exception 'RLS disabled: %',t; end if;
    if has_table_privilege('anon',format('public.%I',t),'SELECT') then raise exception 'Anonymous read: %',t; end if;
    for c in select attname from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped loop
      if has_column_privilege('authenticated',format('public.%I',t),c.attname,'UPDATE') <> (t='profiles' and c.attname='display_name') then raise exception 'Unexpected UPDATE grant: %.%',t,c.attname; end if;
    end loop;
  end loop;
  foreach t in array array['public.execute_trade(uuid,uuid,text,numeric,numeric,uuid)', 'public.refresh_asset_prices()', 'public.use_life_reload(uuid)', 'public.reserve_stripe_checkout(uuid,text,text,text)', 'public.apply_stripe_subscription(text,text,text,text,text,timestamptz)', 'public.apply_stripe_subscription_event(text,text,timestamptz,uuid,text,text,text,text,timestamptz)', 'public.record_lesson_result(uuid,uuid,integer,boolean)'] loop
    if has_function_privilege('authenticated',t,'EXECUTE') or not has_function_privilege('service_role',t,'EXECUTE') then raise exception 'Backend RPC grants: %',t; end if;
  end loop;
  foreach t in array array['public.refill_portfolio_balance()', 'public.submit_academy_quiz(uuid,integer[])', 'public.complete_academy_lesson(uuid)', 'public.get_portfolio_performance(text)', 'public.get_trading_statistics(text)', 'public.get_my_achievements()', 'public.get_global_leaderboard(text,integer,integer,boolean)'] loop
    if not has_function_privilege('authenticated',t,'EXECUTE') then raise exception 'Missing browser RPC grant: %',t; end if;
  end loop;
end; $$;

select set_config('bullvest.audit_a',gen_random_uuid()::text,true);
select set_config('bullvest.audit_b',gen_random_uuid()::text,true);
select set_config('bullvest.audit_asset',(select id::text from public.assets limit 1),true);
select set_config('bullvest.audit_lesson',(select id::text from public.academy_lessons limit 1),true);
do $$ begin
  if nullif(current_setting('bullvest.audit_asset'),'') is null or nullif(current_setting('bullvest.audit_lesson'),'') is null then raise exception 'Audit requires seeded assets and lessons'; end if;
end; $$;
insert into auth.users(id,email,raw_user_meta_data)
select current_setting(k)::uuid,current_setting(k)||'@hardening-audit.invalid','{"display_name":"Security audit"}'::jsonb
from unnest(array['bullvest.audit_a','bullvest.audit_b']) k;
insert into public.portfolios(user_id,asset_id,total_quantity,average_buy_price)
select current_setting(k)::uuid,current_setting('bullvest.audit_asset')::uuid,1,10 from unnest(array['bullvest.audit_a','bullvest.audit_b']) k;
insert into public.transactions(user_id,asset_id,client_request_id,transaction_type,quantity,execution_price,total_value,balance_after,position_after)
select current_setting(k)::uuid,current_setting('bullvest.audit_asset')::uuid,gen_random_uuid(),'BUY',1,10,10,9990,1 from unnest(array['bullvest.audit_a','bullvest.audit_b']) k;
insert into public.user_academy_progress(user_id,lesson_id,score,completed)
select current_setting(k)::uuid,current_setting('bullvest.audit_lesson')::uuid,0,false from unnest(array['bullvest.audit_a','bullvest.audit_b']) k;

select set_config('request.jwt.claim.sub',current_setting('bullvest.audit_a'),true);
set local role authenticated;
do $$ declare t text; n integer; column_name text; begin
  foreach t in array array['profiles','transactions','portfolios','user_academy_progress'] loop
    execute format('select count(*) from public.%I',t) into n;
    if n<>1 then raise exception 'Own-row SELECT failed: % (% rows)',t,n; end if;
    begin
      execute format('delete from public.%I',t);
      raise exception 'Client DELETE accepted: %',t;
    exception when insufficient_privilege then null; end;
    if t<>'profiles' then
      begin
        execute format('update public.%I set user_id=user_id',t);
        raise exception 'Client financial/progress UPDATE accepted';
      exception when insufficient_privilege then null; end;
    end if;
  end loop;
  update public.profiles set display_name='Own name updated' where id=auth.uid();
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Own name UPDATE denied'; end if;
  update public.profiles set display_name='Other name' where id=current_setting('bullvest.audit_b')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Other user UPDATE accepted'; end if;
  foreach column_name in array array['role','fictional_balance','lives_remaining','id'] loop
    begin
      execute format('update public.profiles set %1$I=%1$I where id=auth.uid()',column_name);
      raise exception 'Protected profile column writable: %',column_name;
    exception when insufficient_privilege then null; end;
  end loop;
  -- Owner-only internals must still work when reached through allowed RPCs.
  perform public.refill_portfolio_balance();
  perform public.get_my_achievements();
  perform public.get_portfolio_performance('all');
  perform public.get_trading_statistics('all');
  perform public.get_global_leaderboard('all',20,0,false);
end; $$;
reset role;
set local role anon;
do $$ declare t text; begin
  foreach t in array array['profiles','transactions','portfolios','user_academy_progress'] loop
    begin
      execute format('select * from public.%I limit 1',t);
      raise exception 'Anonymous SELECT accepted: %',t;
    exception when insufficient_privilege then null; end;
  end loop;
end; $$;
reset role;
set local role service_role;
do $$ declare n integer; begin
  select count(*) into n from public.profiles where id in(current_setting('bullvest.audit_a')::uuid,current_setting('bullvest.audit_b')::uuid);
  if n<>2 then raise exception 'Backend access broken'; end if;
end; $$;
reset role;
rollback;
select 'security_hardening_audit: PASS (all changes rolled back)' as result;
