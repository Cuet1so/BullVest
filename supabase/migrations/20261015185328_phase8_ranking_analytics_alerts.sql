begin;
create schema if not exists analytics_private;
revoke all on schema analytics_private from public, anon, authenticated;

create table public.performance_baselines (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  equity numeric(24,8) not null,
  started_at timestamptz not null default clock_timestamp()
);
create table public.equity_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,
  equity numeric(24,8) not null,
  observed_at timestamptz not null,
  quotes_fresh boolean not null,
  primary key(user_id, snapshot_date)
);
create table public.portfolio_cash_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reload_id uuid not null unique references public.life_reloads_log(id) on delete cascade,
  amount numeric(24,8) not null,
  occurred_at timestamptz not null default clock_timestamp()
);
create index portfolio_cash_flows_user_time on public.portfolio_cash_flows(user_id, occurred_at);
alter table public.performance_baselines enable row level security;
alter table public.equity_snapshots enable row level security;
alter table public.portfolio_cash_flows enable row level security;
revoke all on public.performance_baselines, public.equity_snapshots, public.portfolio_cash_flows from public, anon, authenticated;
grant select on public.performance_baselines, public.equity_snapshots, public.portfolio_cash_flows to authenticated;
grant all on public.performance_baselines, public.equity_snapshots, public.portfolio_cash_flows to service_role;
create policy baseline_read_own on public.performance_baselines for select to authenticated using (user_id = (select auth.uid()));
create policy snapshots_read_own on public.equity_snapshots for select to authenticated using (user_id = (select auth.uid()));
create policy cash_flows_read_own on public.portfolio_cash_flows for select to authenticated using (user_id = (select auth.uid()));

create view analytics_private.live_equity with(security_invoker = true) as
select p.id user_id, p.fictional_balance + coalesce(sum(h.total_quantity * a.current_price),0) as equity,
       coalesce(bool_and(coalesce(a.price_updated_at between now()-interval '120 seconds' and now()+interval '5 seconds',false))
                filter(where h.id is not null),true) as quotes_fresh
from public.profiles p left join public.portfolios h on h.user_id=p.id
left join public.assets a on a.id=h.asset_id group by p.id;
revoke all on analytics_private.live_equity from public, anon, authenticated;

create function analytics_private.capture_equity(p_user_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_at timestamptz := clock_timestamp();
begin
  insert into public.performance_baselines(user_id,equity,started_at)
    select user_id,equity,v_at from analytics_private.live_equity where p_user_id is null or user_id=p_user_id
    on conflict(user_id) do nothing;
  insert into public.equity_snapshots(user_id,snapshot_date,equity,observed_at,quotes_fresh)
    select user_id,(v_at at time zone 'UTC')::date,equity,v_at,quotes_fresh
    from analytics_private.live_equity where p_user_id is null or user_id=p_user_id
    on conflict(user_id,snapshot_date) do update set equity=excluded.equity,
      observed_at=excluded.observed_at,quotes_fresh=excluded.quotes_fresh
    where public.equity_snapshots.observed_at <= excluded.observed_at;
end;
$$;
revoke all on function analytics_private.capture_equity(uuid) from public, anon, authenticated;

create function analytics_private.capture_account_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='profiles' then perform analytics_private.capture_equity(new.id);
  else
    if tg_table_name='life_reloads_log' then
      insert into public.portfolio_cash_flows(user_id,reload_id,amount)
      values(new.user_id,new.id,new.balance_after-new.balance_before) on conflict(reload_id) do nothing;
    end if;
    perform analytics_private.capture_equity(new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function analytics_private.capture_account_event() from public, anon, authenticated;
create trigger performance_new_profile after insert on public.profiles for each row execute function analytics_private.capture_account_event();
create trigger performance_trade after insert on public.transactions for each row execute function analytics_private.capture_account_event();
create trigger performance_reload after insert on public.life_reloads_log for each row execute function analytics_private.capture_account_event();

-- Un punto de partida real: no reconstruir precios históricos que no existen.
select analytics_private.capture_equity();

create function analytics_private.period_cutoff(p_period text)
returns timestamptz language plpgsql stable set search_path='' as $$
begin
  if p_period='week' then return now()-interval '7 days';
  elsif p_period='month' then return now()-interval '30 days';
  elsif p_period='all' then return '-infinity'::timestamptz;
  else raise exception 'INVALID_PERIOD'; end if;
end;
$$;
revoke all on function analytics_private.period_cutoff(text) from public, anon, authenticated;

create function analytics_private.starting_point(p_user_id uuid,p_period text)
returns table(equity numeric,observed_at timestamptz) language sql stable set search_path='' as $$
  select x.equity,x.observed_at from (
    select b.equity,b.started_at observed_at from public.performance_baselines b where b.user_id=p_user_id
    union all
    select s.equity,s.observed_at from public.equity_snapshots s where s.user_id=p_user_id
      and s.snapshot_date<(now() at time zone 'UTC')::date
    union all select e.equity,now() from analytics_private.live_equity e where e.user_id=p_user_id
  ) x where x.observed_at>=analytics_private.period_cutoff(p_period) order by x.observed_at limit 1;
$$;
revoke all on function analytics_private.starting_point(uuid,text) from public,anon,authenticated;

create function analytics_private.performance_points(p_user_id uuid,p_period text)
returns table(observed_at timestamptz,equity numeric,return_pct numeric,is_daily_close boolean,quotes_fresh boolean)
language sql stable set search_path='' as $$
  with points as (
    select b.started_at as observed_at,b.equity,false as closing,true as quotes_fresh
    from public.performance_baselines b where b.user_id=p_user_id
    union all
    select s.observed_at,s.equity,true,s.quotes_fresh from public.equity_snapshots s
    join public.performance_baselines b on b.user_id=s.user_id
    where s.user_id=p_user_id and s.snapshot_date < (now() at time zone 'UTC')::date
      and s.observed_at>b.started_at
    union all
    select now(),e.equity,false,e.quotes_fresh from analytics_private.live_equity e where e.user_id=p_user_id
  ), anchor as (
    select min(observed_at) filter(where observed_at>=analytics_private.period_cutoff(p_period)) as at
    from points
  ), ordered as (
    select p.*,lag(p.equity) over w previous_equity,lag(p.observed_at) over w previous_at,
           lag(p.closing) over w previous_closing
    from points p cross join anchor a where p.observed_at>=a.at
    window w as(order by p.observed_at)
  )
  select p.observed_at,p.equity,
    case when p.previous_equity+coalesce(f.weighted,0)>0 and p.observed_at>p.previous_at
      then 100*(p.equity-p.previous_equity-coalesce(f.net,0))/(p.previous_equity+coalesce(f.weighted,0)) end,
    p.closing and coalesce(p.previous_closing,false)
      and (p.observed_at at time zone 'UTC')::date=(p.previous_at at time zone 'UTC')::date+1,
    p.quotes_fresh
  from ordered p left join lateral (
    select sum(c.amount) net,
      sum(c.amount*extract(epoch from (p.observed_at-c.occurred_at))/nullif(extract(epoch from (p.observed_at-p.previous_at)),0)) weighted
    from public.portfolio_cash_flows c where c.user_id=p_user_id
      and c.occurred_at>p.previous_at and c.occurred_at<=p.observed_at
  ) f on true order by p.observed_at;
$$;
revoke all on function analytics_private.performance_points(uuid,text) from public, anon, authenticated;

create function public.get_portfolio_performance(p_period text default 'all')
returns table(observed_at timestamptz,equity numeric,return_pct numeric,is_daily_close boolean,quotes_fresh boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  perform analytics_private.period_cutoff(p_period);
  return query select * from analytics_private.performance_points(auth.uid(),p_period);
end;
$$;
revoke all on function public.get_portfolio_performance(text) from public,anon,authenticated;
grant execute on function public.get_portfolio_performance(text) to authenticated;

create function public.get_trading_statistics(p_period text default 'all')
returns table(sell_count bigint,winning_sells bigint,win_rate_pct numeric)
language plpgsql stable security definer set search_path='' as $$
declare v_cutoff timestamptz;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  v_cutoff:=analytics_private.period_cutoff(p_period);
  return query select count(*),count(*) filter(where realized_pnl>0),
    100.0*count(*) filter(where realized_pnl>0)/nullif(count(*),0)
  from public.transactions where user_id=auth.uid() and transaction_type='SELL'
    and realized_pnl is not null and executed_at>=v_cutoff;
end;
$$;
revoke all on function public.get_trading_statistics(text) from public,anon,authenticated;
grant execute on function public.get_trading_statistics(text) to authenticated;

create table public.trader_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  followed_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,followed_user_id), check(user_id<>followed_user_id)
);
create index trader_follows_target on public.trader_follows(followed_user_id);
alter table public.trader_follows enable row level security;
revoke all on public.trader_follows from public,anon,authenticated;
grant select,delete on public.trader_follows to authenticated;
grant insert(user_id,followed_user_id) on public.trader_follows to authenticated;
grant all on public.trader_follows to service_role;
create policy follows_read_own on public.trader_follows for select to authenticated using(user_id=(select auth.uid()));
create policy follows_insert_own on public.trader_follows for insert to authenticated with check(user_id=(select auth.uid()));
create policy follows_delete_own on public.trader_follows for delete to authenticated using(user_id=(select auth.uid()));

create function analytics_private.badge_ids(p_trades bigint,p_lessons bigint,p_wins bigint)
returns text[] language sql immutable set search_path='' as $$
  select array_remove(array[
    case when p_trades>=1 then 'first_trade' end,
    case when p_trades>=10 then 'ten_trades' end,
    case when p_wins>=1 then 'first_win' end,
    case when p_lessons>=1 then 'first_lesson' end,
    case when p_lessons>=15 then 'academy_graduate' end
  ],null);
$$;
revoke all on function analytics_private.badge_ids(bigint,bigint,bigint) from public,anon,authenticated;

create function public.get_my_achievements()
returns table(trade_count bigint,completed_lessons bigint,winning_sells bigint,badges text[])
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  return query with t as(select count(*) n,count(*) filter(where transaction_type='SELL' and realized_pnl>0) w
                        from public.transactions where user_id=auth.uid()),
    l as(select count(*) n from public.user_academy_progress where user_id=auth.uid() and completed)
  select t.n,l.n,t.w,analytics_private.badge_ids(t.n,l.n,t.w) from t cross join l;
end;
$$;
revoke all on function public.get_my_achievements() from public,anon,authenticated;
grant execute on function public.get_my_achievements() to authenticated;

create function public.get_global_leaderboard(p_period text default 'all',p_limit integer default 20,p_offset integer default 0,p_following boolean default false)
returns table(rank bigint,user_id uuid,display_name text,total_equity numeric,roi_pct numeric,
              win_rate_pct numeric,sell_count bigint,badges text[],is_following boolean,total_count bigint,measured_since timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare v_cutoff timestamptz; v_viewer uuid:=auth.uid();
begin
  if v_viewer is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset<0 or p_following is null then
    raise exception 'INVALID_PAGINATION';
  end if;
  v_cutoff:=analytics_private.period_cutoff(p_period);
  return query with trades as (
    select t.user_id,count(*) n,count(*) filter(where t.transaction_type='SELL' and t.realized_pnl>0) wins_all,
      count(*) filter(where t.transaction_type='SELL' and t.realized_pnl is not null and t.executed_at>=v_cutoff) sells,
      count(*) filter(where t.transaction_type='SELL' and t.realized_pnl>0 and t.executed_at>=v_cutoff) wins
    from public.transactions t group by t.user_id
  ), lessons as (
    select g.user_id,count(*) n from public.user_academy_progress g where g.completed group by g.user_id
  ), metrics as (
    select p.id,
      case when nullif(trim(p.display_name),'') is not null and position('@' in p.display_name)=0
        then left(p.display_name,40) else 'Inversor '||left(p.id::text,6) end as name,
      e.equity,
      case when coalesce(s.equity,b.equity)+coalesce(f.weighted,0)>0
        then 100*(e.equity-coalesce(s.equity,b.equity)-coalesce(f.net,0))/(coalesce(s.equity,b.equity)+coalesce(f.weighted,0)) end as roi,
      100.0*coalesce(t.wins,0)/nullif(t.sells,0) as win_rate,coalesce(t.sells,0) as sells,
      analytics_private.badge_ids(coalesce(t.n,0),coalesce(l.n,0),coalesce(t.wins_all,0)) as earned,
      exists(select 1 from public.trader_follows tf where tf.user_id=v_viewer and tf.followed_user_id=p.id) as following,
      coalesce(s.observed_at,b.started_at) as since
    from public.profiles p join analytics_private.live_equity e on e.user_id=p.id
    join public.performance_baselines b on b.user_id=p.id
    left join trades t on t.user_id=p.id left join lessons l on l.user_id=p.id
    left join lateral analytics_private.starting_point(p.id,p_period) s on true
    left join lateral (
      select sum(cf.amount) net,sum(cf.amount*extract(epoch from(now()-cf.occurred_at)) /
        nullif(extract(epoch from(now()-coalesce(s.observed_at,b.started_at))),0)) weighted
      from public.portfolio_cash_flows cf where cf.user_id=p.id
        and cf.occurred_at>coalesce(s.observed_at,b.started_at) and cf.occurred_at<=now()
    ) f on true
  ), ranked as (
    select row_number() over(order by m.roi desc nulls last,m.equity desc,m.id) as place,m.* from metrics m
  )
  select r.place,r.id,r.name,r.equity,r.roi,r.win_rate,r.sells,r.earned,r.following,count(*) over(),r.since
  from ranked r where not p_following or r.following order by r.place limit p_limit offset p_offset;
end;
$$;
revoke all on function public.get_global_leaderboard(text,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.get_global_leaderboard(text,integer,integer,boolean) to authenticated;

create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  direction text not null check(direction in ('above','below')),
  target_price numeric(20,8) not null check(target_price>0 and target_price::text not in ('NaN','Infinity','-Infinity')),
  status text not null default 'active' check(status in ('active','triggered')),
  created_at timestamptz not null default clock_timestamp(),
  triggered_at timestamptz,
  triggered_price numeric(20,8),
  read_at timestamptz,
  check((status='active' and triggered_at is null and triggered_price is null and read_at is null)
     or (status='triggered' and triggered_at is not null and triggered_price>0))
);
create index price_alerts_active_asset on public.price_alerts(asset_id,direction,target_price) where status='active';
create index price_alerts_user_created on public.price_alerts(user_id,created_at desc);
alter table public.price_alerts enable row level security;
revoke all on public.price_alerts from public,anon,authenticated;
grant select,delete on public.price_alerts to authenticated;
grant insert(user_id,asset_id,direction,target_price) on public.price_alerts to authenticated;
grant update(read_at) on public.price_alerts to authenticated;
grant all on public.price_alerts to service_role;
create policy alerts_read_own on public.price_alerts for select to authenticated using(user_id=(select auth.uid()));
create policy alerts_insert_own on public.price_alerts for insert to authenticated with check(user_id=(select auth.uid()));
create policy alerts_delete_own on public.price_alerts for delete to authenticated using(user_id=(select auth.uid()));
create policy alerts_read_marker on public.price_alerts for update to authenticated
  using(user_id=(select auth.uid()) and status='triggered') with check(user_id=(select auth.uid()) and status='triggered');

create function analytics_private.process_alerts(p_alert_id uuid default null)
returns void language sql security definer set search_path='' as $$
  update public.price_alerts pa set status='triggered',triggered_at=clock_timestamp(),triggered_price=a.current_price,read_at=null
  from public.assets a where a.id=pa.asset_id and pa.status='active' and (p_alert_id is null or pa.id=p_alert_id)
    and a.price_updated_at between now()-interval '120 seconds' and now()+interval '5 seconds'
    and ((pa.direction='above' and a.current_price>=pa.target_price) or (pa.direction='below' and a.current_price<=pa.target_price));
$$;
revoke all on function analytics_private.process_alerts(uuid) from public,anon,authenticated;
create function analytics_private.alert_insert_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.profiles where id=new.user_id for update;
  if (select count(*) from public.price_alerts where user_id=new.user_id)>=100 then raise exception 'ALERT_LIMIT_REACHED'; end if;
  return new;
end;
$$;
revoke all on function analytics_private.alert_insert_guard() from public,anon,authenticated;
create function analytics_private.alert_created()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform analytics_private.process_alerts(new.id); return new; end;
$$;
revoke all on function analytics_private.alert_created() from public,anon,authenticated;
create trigger price_alert_limit before insert on public.price_alerts for each row execute function analytics_private.alert_insert_guard();
create trigger price_alert_evaluate after insert on public.price_alerts for each row execute function analytics_private.alert_created();

create function analytics_private.market_updated()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform analytics_private.process_alerts(); perform analytics_private.capture_equity(); return null; end;
$$;
revoke all on function analytics_private.market_updated() from public,anon,authenticated;
create trigger market_analytics after update of current_price,price_updated_at on public.assets
for each statement execute function analytics_private.market_updated();

-- Guardar el cierre observado aunque nadie tenga la aplicación abierta.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('bullvest-equity-snapshots','*/5 * * * *','select analytics_private.capture_equity();');
commit;
