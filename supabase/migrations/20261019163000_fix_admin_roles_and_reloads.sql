begin;

-- profiles.role stores the canonical values 'free', 'pro' and 'admin'.
-- Both the authenticated RPC and the trading Edge Function use this helper.
create or replace function public.use_life_reload(p_user_id uuid)
returns table (reload_id uuid, resulting_balance numeric, remaining_lives smallint)
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles%rowtype;
  v_lives smallint;
  v_id uuid;
begin
  -- Serialize concurrent reloads so Free accounts cannot spend the same life twice.
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  if v_profile.role in ('pro', 'admin') then
    v_lives := v_profile.lives_remaining;
  elsif v_profile.role = 'free' then
    if v_profile.lives_remaining <= 0 then
      raise exception 'NO_FREE_LIVES_REMAINING'
        using hint = 'Recargas agotadas. Necesitas BullVest Pro para seguir recargando.';
    end if;
    v_lives := v_profile.lives_remaining - 1;
  else
    raise exception 'INVALID_PROFILE_ROLE';
  end if;

  update public.profiles
     set fictional_balance = 10000.00, lives_remaining = v_lives
   where id = p_user_id;

  -- Keep was_pro literal: Admin has unlimited reloads without being a Pro subscriber.
  insert into public.life_reloads_log
    (user_id, lives_after_reload, was_pro, balance_before, balance_after)
  values (p_user_id, v_lives, v_profile.role = 'pro', v_profile.fictional_balance, 10000.00)
  returning id into v_id;

  return query select v_id, 10000.00::numeric, v_lives;
end;
$$;
revoke all on function public.use_life_reload(uuid) from public, anon, authenticated;
grant execute on function public.use_life_reload(uuid) to service_role;

create or replace function public.refill_portfolio_balance()
returns table (reload_id uuid, resulting_balance numeric, remaining_lives smallint)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode = '42501'; end if;
  return query select * from public.use_life_reload(auth.uid());
end;
$$;
revoke all on function public.refill_portfolio_balance() from public, anon, authenticated;
grant execute on function public.refill_portfolio_balance() to authenticated;

-- Current Stripe webhook: retain deduplication, ordering and billing metadata.
-- The locked database role is authoritative; a Stripe event cannot replace Admin.
create or replace function public.apply_stripe_subscription(
  p_event_id text, p_customer_id text, p_subscription_id text,
  p_status text, p_role text, p_sync_started_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_role is null or p_role not in ('free', 'pro') or p_sync_started_at is null then
    raise exception 'INVALID_SUBSCRIPTION_STATE';
  end if;
  select * into v_profile from public.profiles
    where stripe_customer_id = p_customer_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into private.stripe_events(event_id, profile_id) values (p_event_id, v_profile.id)
    on conflict (event_id) do nothing;
  if not found then return; end if;
  if v_profile.stripe_sync_started_at > p_sync_started_at then return; end if;

  update public.profiles
     set role = case when v_profile.role = 'admin' then 'admin' else p_role end,
         stripe_subscription_id = p_subscription_id,
         stripe_subscription_status = p_status,
         stripe_sync_started_at = p_sync_started_at
   where id = v_profile.id;
end;
$$;
revoke all on function public.apply_stripe_subscription(text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription(text,text,text,text,text,timestamptz)
  to service_role;

-- Legacy apply_stripe_subscription_event writes public.subscriptions. Its existing
-- subscriptions_sync_profile trigger calls this function on INSERT/UPDATE/DELETE.
create or replace function public.sync_profile_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_status := null;
  else
    v_user_id := new.user_id;
    v_status := new.status;
  end if;

  -- Evaluate the guard in the UPDATE itself, under the profile row lock.
  -- Admin is immutable for every subscription status, including deletion.
  update public.profiles
     set role = case when v_status in ('active', 'trialing') then 'pro' else 'free' end
   where id = v_user_id and role <> 'admin';

  return null;
end;
$$;
revoke all on function public.sync_profile_plan() from public, anon, authenticated;

commit;
