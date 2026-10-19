-- Run after the migration, or prepend its SQL without BEGIN/COMMIT for a dry run.
-- All users, subscriptions, balances, events and logs created here are rolled back.
begin;
set local statement_timeout = '30s';
select set_config('bullvest.admin_audit_free', gen_random_uuid()::text, true);
select set_config('bullvest.admin_audit_pro', gen_random_uuid()::text, true);
select set_config('bullvest.admin_audit_admin', gen_random_uuid()::text, true);
insert into auth.users(id, email, raw_user_meta_data)
select current_setting(key)::uuid, current_setting(key) || '@admin-audit.invalid',
       '{"display_name":"Admin role audit"}'::jsonb
from unnest(array['bullvest.admin_audit_free','bullvest.admin_audit_pro','bullvest.admin_audit_admin']) as key;
update public.profiles set fictional_balance=123.45, lives_remaining=3
where id=current_setting('bullvest.admin_audit_free')::uuid;
update public.profiles set role='pro', fictional_balance=123.45, lives_remaining=0
where id=current_setting('bullvest.admin_audit_pro')::uuid;
update public.profiles set role='admin', fictional_balance=123.45, lives_remaining=0
where id=current_setting('bullvest.admin_audit_admin')::uuid;

-- Browser-facing RPC: Free spends exactly one life per success.
select set_config('request.jwt.claim.sub', current_setting('bullvest.admin_audit_free'), true);
set local role authenticated;
do $$ declare r record; begin
  for i in 1..3 loop
    select * into strict r from public.refill_portfolio_balance();
    if r.remaining_lives<>3-i or r.resulting_balance<>10000 then
      raise exception 'Free refill did not spend exactly one life';
    end if;
  end loop;
end; $$;
reset role;
update public.profiles set fictional_balance=77 where id=current_setting('bullvest.admin_audit_free')::uuid;
set local role authenticated;
do $$ begin
  begin
    perform public.refill_portfolio_balance();
    raise exception 'Exhausted Free refill accepted';
  exception when raise_exception then
    if sqlerrm<>'NO_FREE_LIVES_REMAINING' then raise; end if;
  end;
end; $$;
reset role;
do $$ begin
  if not exists(select 1 from public.profiles where id=current_setting('bullvest.admin_audit_free')::uuid
    and fictional_balance=77 and lives_remaining=0)
    or (select count(*) from public.life_reloads_log where user_id=current_setting('bullvest.admin_audit_free')::uuid)<>3 then
    raise exception 'Rejected refill changed balance, lives or log';
  end if;
end; $$;

-- Unlimited roles work even at zero lives through the authenticated endpoint.
select set_config('request.jwt.claim.sub', current_setting('bullvest.admin_audit_admin'), true);
set local role authenticated;
do $$ declare r record; begin
  for i in 1..4 loop
    select * into strict r from public.refill_portfolio_balance();
    if r.remaining_lives<>0 or r.resulting_balance<>10000 then raise exception 'Admin reload consumed lives'; end if;
  end loop;
end; $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('bullvest.admin_audit_pro'), true);
set local role authenticated;
do $$ declare r record; begin
  for i in 1..4 loop
    select * into strict r from public.refill_portfolio_balance();
    if r.remaining_lives<>0 or r.resulting_balance<>10000 then raise exception 'Pro reload consumed lives'; end if;
  end loop;
end; $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.profiles set lives_remaining=2, fictional_balance=42
where id in (current_setting('bullvest.admin_audit_pro')::uuid,current_setting('bullvest.admin_audit_admin')::uuid);
set local role service_role;
do $$ declare r record; target text; begin
  foreach target in array array['bullvest.admin_audit_pro','bullvest.admin_audit_admin'] loop
    select * into strict r from public.use_life_reload(current_setting(target)::uuid);
    if r.remaining_lives<>2 or r.resulting_balance<>10000 then raise exception 'Service reload consumed unlimited role lives'; end if;
  end loop;
end; $$;
reset role;

-- Current webhook: Admin remains Admin for every supported status; metadata still syncs.
update public.profiles set stripe_customer_id='cus_'||id::text
where id in (current_setting('bullvest.admin_audit_admin')::uuid,current_setting('bullvest.admin_audit_free')::uuid);
set local role service_role;
do $$ declare
  v_admin uuid:=current_setting('bullvest.admin_audit_admin')::uuid;
  v_status text; v_counter integer:=0; v_expected text;
begin
  foreach v_status in array array['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused'] loop
    v_counter:=v_counter+1;
    v_expected:=case when v_status in ('active','trialing') then 'pro' else 'free' end;
    perform public.apply_stripe_subscription('evt_current_'||v_admin||'_'||v_status,'cus_'||v_admin,
      'sub_current_'||v_admin,v_status,v_expected,now()+v_counter*interval '1 second');
    if not exists(select 1 from public.profiles where id=v_admin and role='admin' and stripe_subscription_status=v_status) then
      raise exception 'Current webhook changed Admin or failed to sync metadata for %',v_status;
    end if;
  end loop;
  -- A replay with a later timestamp and an older independent event are both ignored.
  perform public.apply_stripe_subscription('evt_current_'||v_admin||'_paused','cus_'||v_admin,
    'sub_current_'||v_admin,'active','pro',now()+interval '20 seconds');
  perform public.apply_stripe_subscription('evt_stale_'||v_admin,'cus_'||v_admin,
    'sub_current_'||v_admin,'active','pro',now());
  if not exists(select 1 from public.profiles where id=v_admin and role='admin' and stripe_subscription_status='paused') then
    raise exception 'Webhook deduplication or ordering regressed';
  end if;
end; $$;

-- Legacy webhook: exercise its real trigger on insertion, every status and deletion.
do $$ declare
  v_admin uuid:=current_setting('bullvest.admin_audit_admin')::uuid;
  v_status text; v_counter integer:=0; v_event_type text;
begin
  foreach v_status in array array['active','trialing','incomplete','incomplete_expired','past_due','canceled','unpaid','paused'] loop
    v_counter:=v_counter+1;
    v_event_type:=case when v_counter=1 then 'customer.subscription.created'
                      when v_status='canceled' then 'customer.subscription.deleted'
                      else 'customer.subscription.updated' end;
    perform public.apply_stripe_subscription_event('evt_legacy_'||v_admin||'_'||v_status,
      v_event_type,now()+v_counter*interval '1 second',v_admin,'cus_'||v_admin,
      'sub_legacy_'||v_admin,'price_audit',v_status,now()+interval '1 month');
    if not exists(select 1 from public.profiles where id=v_admin and role='admin') then
      raise exception 'Legacy subscription trigger changed Admin for %',v_status;
    end if;
  end loop;
  delete from public.subscriptions where user_id=v_admin;
  if not exists(select 1 from public.profiles where id=v_admin and role='admin') then
    raise exception 'Deleting a subscription changed Admin';
  end if;
end; $$;

-- Non-admin transitions remain functional in both Stripe paths.
do $$ declare v_free uuid:=current_setting('bullvest.admin_audit_free')::uuid; begin
  perform public.apply_stripe_subscription('evt_promote_'||v_free,'cus_'||v_free,'sub_current_'||v_free,'active','pro',now());
  if (select role from public.profiles where id=v_free)<>'pro' then raise exception 'Current webhook failed to upgrade Free'; end if;
  perform public.apply_stripe_subscription('evt_cancel_'||v_free,'cus_'||v_free,'sub_current_'||v_free,'canceled','free',now()+interval '1 second');
  if (select role from public.profiles where id=v_free)<>'free' then raise exception 'Current webhook failed to downgrade Pro'; end if;
  perform public.apply_stripe_subscription_event('evt_legacy_promote_'||v_free,'customer.subscription.created',now(),
    v_free,'cus_'||v_free,'sub_legacy_'||v_free,'price_audit','active',now()+interval '1 month');
  if (select role from public.profiles where id=v_free)<>'pro' then raise exception 'Legacy trigger failed to upgrade Free'; end if;
  delete from public.subscriptions where user_id=v_free;
  if (select role from public.profiles where id=v_free)<>'free' then raise exception 'Legacy trigger failed to downgrade Pro'; end if;
end; $$;
reset role;

do $$ begin
  if has_function_privilege('anon','public.refill_portfolio_balance()','execute')
    or not has_function_privilege('authenticated','public.refill_portfolio_balance()','execute')
    or has_function_privilege('authenticated','public.use_life_reload(uuid)','execute')
    or has_function_privilege('authenticated','public.apply_stripe_subscription(text,text,text,text,text,timestamptz)','execute')
    or has_function_privilege('authenticated','public.sync_profile_plan()','execute') then
    raise exception 'Function privileges regressed';
  end if;
  begin
    perform public.refill_portfolio_balance();
    raise exception 'Unauthenticated refill accepted';
  exception when insufficient_privilege then null;
  end;
end; $$;
rollback;
select 'PASS: Free exhaustion, unlimited Pro/Admin, both Stripe paths, deletion, deduplication, ordering and permissions; rolled back' as audit_result;
