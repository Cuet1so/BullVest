-- All test users and writes are rolled back. No email or Stripe requests.
begin;
select set_config('bullvest.audit_a', gen_random_uuid()::text, true);
select set_config('bullvest.audit_b', gen_random_uuid()::text, true);
insert into auth.users(id, email, raw_user_meta_data)
select current_setting(key)::uuid, current_setting(key) || '@billing-audit.invalid',
  '{"full_name":"Google audit", "role":"pro", "lives_remaining":99, "fictional_balance":99999}'::jsonb
from unnest(array['bullvest.audit_a','bullvest.audit_b']) as key;
do $$ begin
  if (select count(*) from public.profiles where id in
    (current_setting('bullvest.audit_a')::uuid,current_setting('bullvest.audit_b')::uuid)
    and role='free' and lives_remaining=3 and fictional_balance=10000 and display_name='Google audit') <> 2
  then raise exception 'OAuth defaults or metadata isolation failed'; end if;
  if has_function_privilege('anon','public.refill_portfolio_balance()','execute')
    or has_function_privilege('authenticated','public.use_life_reload(uuid)','execute')
    or has_function_privilege('authenticated','public.apply_stripe_subscription(text,text,text,text,text,timestamptz)','execute')
  then raise exception 'Privileged endpoint exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('bullvest.audit_a'), true);
set local role authenticated;
do $$ declare r record; blocked boolean; begin
  for i in 1..3 loop
    select * into strict r from public.refill_portfolio_balance();
    if r.remaining_lives <> 3-i or r.resulting_balance <> 10000 then raise exception 'Incorrect refill'; end if;
  end loop;
  blocked := false;
  begin perform public.refill_portfolio_balance();
  exception when raise_exception then
    if sqlerrm <> 'NO_FREE_LIVES_REMAINING' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Fourth Free refill accepted'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Profile RLS failed'; end if;
  blocked := false;
  begin update public.profiles set role='pro', lives_remaining=3, fictional_balance=99999, stripe_customer_id='cus_fake' where id=auth.uid();
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Client can mutate protected fields'; end if;
end $$;
reset role;
do $$ begin
  if (select lives_remaining from public.profiles where id=current_setting('bullvest.audit_b')::uuid) <> 3
  then raise exception 'Refill affected another user'; end if;
end $$;
update public.profiles set role='pro' where id=current_setting('bullvest.audit_a')::uuid;
set local role authenticated;
do $$ declare r record; begin
  for i in 1..4 loop
    select * into strict r from public.refill_portfolio_balance();
    if r.remaining_lives <> 0 or r.resulting_balance <> 10000 then raise exception 'Pro refill consumed lives'; end if;
  end loop;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
do $$ declare blocked boolean := false; begin
  begin perform public.refill_portfolio_balance();
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Refill without identity accepted'; end if;
end $$;
update public.profiles set stripe_customer_id='cus_' || current_setting('bullvest.audit_a')
where id=current_setting('bullvest.audit_a')::uuid;
select public.apply_stripe_subscription('evt_a', 'cus_' || current_setting('bullvest.audit_a'), 'sub_a', 'active', 'pro', now());
-- Replay and older snapshots must not downgrade the new entitlement.
select public.apply_stripe_subscription('evt_a', 'cus_' || current_setting('bullvest.audit_a'), 'sub_a', 'canceled', 'free', now()+interval '1 second');
select public.apply_stripe_subscription('evt_old', 'cus_' || current_setting('bullvest.audit_a'), 'sub_a', 'canceled', 'free', now()-interval '1 second');
do $$ begin
  if (select role from public.profiles where id=current_setting('bullvest.audit_a')::uuid) <> 'pro'
  then raise exception 'Duplicate/stale webhook changed entitlement'; end if;
end $$;
select public.apply_stripe_subscription('evt_fail', 'cus_' || current_setting('bullvest.audit_a'), 'sub_a', 'past_due', 'free', now()+interval '2 seconds');
do $$ begin
  if (select role from public.profiles where id=current_setting('bullvest.audit_a')::uuid) <> 'free'
  then raise exception 'Failed payment did not downgrade'; end if;
end $$;
do $$ declare first_key uuid; next_key uuid; blocked boolean := false; begin
  first_key := public.reserve_stripe_checkout(current_setting('bullvest.audit_a')::uuid, 'price_month', 'http://localhost:5173', 'initial');
  next_key := public.reserve_stripe_checkout(current_setting('bullvest.audit_a')::uuid, 'price_month', 'http://localhost:5173', 'initial');
  if first_key <> next_key then raise exception 'Checkout retries use different keys'; end if;
  begin perform public.reserve_stripe_checkout(current_setting('bullvest.audit_a')::uuid, 'price_year', 'http://localhost:5173', 'initial');
  exception when raise_exception then
    if sqlerrm <> 'CHECKOUT_ALREADY_OPEN' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Concurrent different plan allowed'; end if;
  next_key := public.reserve_stripe_checkout(current_setting('bullvest.audit_a')::uuid, 'price_month', 'http://localhost:5173', 'sub_canceled');
  if first_key = next_key then raise exception 'Resubscription reused completed session'; end if;
  if has_function_privilege('authenticated','public.reserve_stripe_checkout(uuid,text,text,text)','execute')
  then raise exception 'Checkout reservation exposed to users'; end if;
end $$;
rollback;
select 'PASS: OAuth defaults, 3 Free lives, unlimited Pro refills, RLS, privileges, webhook deduplication and ordering; rolled back' as audit_result;
