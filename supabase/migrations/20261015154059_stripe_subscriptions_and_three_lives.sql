begin;

alter table public.profiles
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column stripe_subscription_status text,
  add column stripe_sync_started_at timestamptz;
alter table public.profiles alter column fictional_balance set default 10000.00;
alter table public.profiles alter column lives_remaining set default 3;
alter table public.life_reloads_log alter column balance_after set default 10000.00;

-- Metadata supplies only the display name, never entitlements or money.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, role, lives_remaining, fictional_balance)
  values (new.id, left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), '')
  ), 80), 'free', 3, 10000.00);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Keep the legacy service-only endpoint consistent with the new RPC.
-- Existing balances/positions/history are not rewritten by this migration.
create or replace function public.use_life_reload(p_user_id uuid)
returns table (reload_id uuid, resulting_balance numeric, remaining_lives smallint)
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles%rowtype;
  v_lives smallint;
  v_id uuid;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_profile.role = 'free' and v_profile.lives_remaining <= 0 then
    raise exception 'NO_FREE_LIVES_REMAINING'
      using hint = 'Recargas agotadas. Necesitas BullVest Pro para seguir recargando.';
  end if;
  v_lives := case when v_profile.role = 'pro' then v_profile.lives_remaining
    else v_profile.lives_remaining - 1 end;
  update public.profiles set fictional_balance = 10000.00, lives_remaining = v_lives
    where id = p_user_id;
  insert into public.life_reloads_log
    (user_id, lives_after_reload, was_pro, balance_before, balance_after)
  values (p_user_id, v_lives, v_profile.role = 'pro', v_profile.fictional_balance, 10000.00)
  returning id into v_id;
  return query select v_id, 10000.00::numeric, v_lives;
end;
$$;
revoke all on function public.use_life_reload(uuid) from public, anon, authenticated;
grant execute on function public.use_life_reload(uuid) to service_role;

-- No user id argument: the authenticated identity is the only possible target.
create function public.refill_portfolio_balance()
returns table (reload_id uuid, resulting_balance numeric, remaining_lives smallint)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode = '42501'; end if;
  return query select * from public.use_life_reload(auth.uid());
end;
$$;
revoke all on function public.refill_portfolio_balance() from public, anon;
grant execute on function public.refill_portfolio_balance() to authenticated;

alter table public.profiles enable row level security;
-- Existing own-row SELECT/UPDATE policies are retained. Clients can edit only the name.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.stripe_events (
  event_id text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  processed_at timestamptz not null default now()
);
create index stripe_events_profile_idx on private.stripe_events(profile_id);
alter table private.stripe_events enable row level security;

-- Atomically deduplicate events and ignore snapshots superseded by a newer read.
create function public.apply_stripe_subscription(
  p_event_id text, p_customer_id text, p_subscription_id text,
  p_status text, p_role text, p_sync_started_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare v_profile public.profiles%rowtype;
begin
  if p_role not in ('free', 'pro') or p_sync_started_at is null then
    raise exception 'INVALID_SUBSCRIPTION_STATE';
  end if;
  select * into v_profile from public.profiles
    where stripe_customer_id = p_customer_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  insert into private.stripe_events(event_id, profile_id) values (p_event_id, v_profile.id)
    on conflict (event_id) do nothing;
  if not found then return; end if;
  if v_profile.stripe_sync_started_at > p_sync_started_at then return; end if;
  update public.profiles set role = p_role,
    stripe_subscription_id = p_subscription_id, stripe_subscription_status = p_status,
    stripe_sync_started_at = p_sync_started_at where id = v_profile.id;
end;
$$;
revoke all on function public.apply_stripe_subscription(text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription(text,text,text,text,text,timestamptz)
  to service_role;

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
commit;
