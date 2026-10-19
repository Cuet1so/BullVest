-- Security hardening after the admin role and reload fixes.
-- No business data is rewritten.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Cover every overload in application-owned schemas, including legacy functions.
-- Never modify Supabase-managed schemas or functions owned by extensions.
do $hardening$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and p.prokind = 'f'
      and n.nspname in ('public', 'private', 'academy_private', 'analytics_private')
      and not exists (
        select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f.signature);
  end loop;
end;
$hardening$;

-- Browser RPCs derive the identity from auth.uid() internally. Never grant the
-- legacy RPCs accepting an arbitrary user ID to authenticated clients.
grant execute on function public.refill_portfolio_balance() to authenticated;
grant execute on function public.submit_academy_quiz(uuid, integer[]) to authenticated;
grant execute on function public.complete_academy_lesson(uuid) to authenticated;
grant execute on function public.get_portfolio_performance(text) to authenticated;
grant execute on function public.get_trading_statistics(text) to authenticated;
grant execute on function public.get_my_achievements() to authenticated;
grant execute on function public.get_global_leaderboard(text, integer, integer, boolean) to authenticated;

-- Edge Functions/webhooks only. These must not be exposed directly to clients.
grant execute on function public.execute_trade(uuid, uuid, text, numeric, numeric, uuid) to service_role;
grant execute on function public.refresh_asset_prices() to service_role;
grant execute on function public.use_life_reload(uuid) to service_role;
grant execute on function public.reserve_stripe_checkout(uuid, text, text, text) to service_role;
grant execute on function public.apply_stripe_subscription(text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.apply_stripe_subscription_event(text, text, timestamptz, uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.record_lesson_result(uuid, uuid, integer, boolean) to service_role;
-- Trigger/event-trigger functions and analytics internals remain owner-only.
-- Existing triggers and owner-run cron jobs do not require browser EXECUTE.

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.portfolios enable row level security;
alter table public.user_academy_progress enable row level security;

-- Replace policies on these four private tables: permissive policies are ORed,
-- so adding an own-row policy alone would not remove an old public/admin bypass.
do $policies$
declare p record; t text; c record; owner_column text;
begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'transactions', 'portfolios', 'user_academy_progress')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  foreach t in array array['profiles', 'transactions', 'portfolios', 'user_academy_progress'] loop
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', t);
    -- Table-level REVOKE does not revoke pre-existing column-level privileges.
    for c in select attname from pg_attribute
      where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped
    loop
      execute format('revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on public.%2$I from public, anon, authenticated', c.attname, t);
    end loop;
    execute format('grant select on public.%I to authenticated', t);
    owner_column := case when t = 'profiles' then 'id' else 'user_id' end;
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = %I)', t || '_read_own', t, owner_column);
    -- Additional restrictive fence protects ownership even if another permissive
    -- policy is added later. USING and WITH CHECK prevent changing the owner.
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select auth.uid()) = %I) with check ((select auth.uid()) = %I)', t || '_owner_guard', t, owner_column, owner_column);
  end loop;
end;
$policies$;

-- Only names are editable by clients; roles, cash, lives and billing are server-owned.
grant update (display_name) on public.profiles to authenticated;
create policy profiles_update_own_name on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- Transactions/positions/progress remain read-only to the browser. Their
-- SECURITY DEFINER RPCs perform validated writes; do not add UPDATE grants here.

commit;
