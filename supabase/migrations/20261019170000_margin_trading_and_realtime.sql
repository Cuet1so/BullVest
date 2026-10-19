begin;
create table public.margin_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id),
  client_request_id uuid not null,
  side text not null check(side in ('BUY','SELL')),
  investment numeric(15,2) not null check(investment > 0),
  multiplier integer not null check(multiplier in (1,2,5,10,20,50,100)),
  entry_price numeric(20,8) not null check(entry_price > 0),
  quantity numeric(40,20) not null check(quantity > 0),
  stop_loss_amount numeric(15,2) check(stop_loss_amount > 0 and stop_loss_amount <= investment),
  take_profit_amount numeric(15,2) check(take_profit_amount > 0),
  commission numeric(15,2) not null default 0 check(commission=0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  exit_price numeric(20,8),
  realized_pnl numeric(15,2),
  close_reason text check(close_reason in ('manual','stop_loss','take_profit','liquidation')),
  balance_after numeric(15,2) not null,
  unique(user_id,client_request_id)
);
create index margin_positions_open on public.margin_positions(asset_id,user_id) where closed_at is null;
create index margin_positions_user on public.margin_positions(user_id,opened_at desc);
alter table public.margin_positions enable row level security;
revoke all on public.margin_positions from public,anon,authenticated;
grant select on public.margin_positions to authenticated;
grant all on public.margin_positions to service_role;
create policy margin_read_own on public.margin_positions for select to authenticated using(user_id=(select auth.uid()));

create function public.open_margin_position(p_user_id uuid,p_asset_id uuid,p_side text,p_investment numeric,p_multiplier integer,p_request_id uuid,p_stop_loss numeric default null,p_take_profit numeric default null)
returns public.margin_positions language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; a public.assets%rowtype; m public.margin_positions%rowtype; price numeric; spread_loss numeric;
begin
  if p_user_id is null or p_request_id is null or p_asset_id is null or p_side is null or p_side not in ('BUY','SELL')
    or p_multiplier is null or p_multiplier not in(1,2,5,10,20,50,100)
    or p_investment is null or p_investment::text in('NaN','Infinity','-Infinity') or p_investment < 0.01 or p_investment>1000000000 or p_investment<>round(p_investment,2)
    or (p_stop_loss is not null and (p_stop_loss::text in('NaN','Infinity','-Infinity') or p_stop_loss<=0 or p_stop_loss>p_investment or p_stop_loss<>round(p_stop_loss,2)))
    or (p_take_profit is not null and (p_take_profit::text in('NaN','Infinity','-Infinity') or p_take_profit<=0 or p_take_profit>1000000000 or p_take_profit<>round(p_take_profit,2))) then raise exception 'INVALID_MARGIN_ORDER'; end if;
  select * into p from public.profiles where id=p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into m from public.margin_positions where user_id=p_user_id and client_request_id=p_request_id;
  if found then
    if m.asset_id<>p_asset_id or m.side<>p_side or m.investment<>p_investment or m.multiplier<>p_multiplier
      or m.stop_loss_amount is distinct from p_stop_loss or m.take_profit_amount is distinct from p_take_profit then raise exception 'REQUEST_ID_REUSED_WITH_DIFFERENT_ORDER'; end if;
    return m;
  end if;
  if (select count(*) from public.margin_positions where user_id=p_user_id and closed_at is null)>=100 then raise exception 'TOO_MANY_OPEN_POSITIONS'; end if;
  select * into a from public.assets where id=p_asset_id for share;
  if not found then raise exception 'ASSET_NOT_FOUND'; end if;
  if not a.is_tradable or a.currency<>'USD' then raise exception 'ASSET_NOT_TRADABLE'; end if;
  if a.price_updated_at is null or a.price_updated_at not between now()-interval '120 seconds' and now()+interval '5 seconds'
    or a.current_price::text in('NaN','Infinity','-Infinity') or a.sell_price::text in('NaN','Infinity','-Infinity')
    or a.current_price<=0 or a.sell_price is null or a.sell_price<=0 or a.sell_price>a.current_price then raise exception 'QUOTE_STALE_OR_UNAVAILABLE'; end if;
  if p.fictional_balance<p_investment then raise exception 'INSUFFICIENT_FICTIONAL_FUNDS'; end if;
  price:=case when p_side='BUY' then a.current_price else a.sell_price end;
  spread_loss:=(a.current_price-a.sell_price)*(p_investment*p_multiplier/price);
  if spread_loss>=coalesce(p_stop_loss,p_investment) then raise exception 'MARGIN_TOO_SMALL_FOR_SPREAD'; end if;
  update public.profiles set fictional_balance=fictional_balance-p_investment where id=p_user_id;
  insert into public.margin_positions(user_id,asset_id,client_request_id,side,investment,multiplier,entry_price,quantity,stop_loss_amount,take_profit_amount,balance_after)
    values(p_user_id,p_asset_id,p_request_id,p_side,p_investment,p_multiplier,price,p_investment*p_multiplier/price,p_stop_loss,p_take_profit,p.fictional_balance-p_investment) returning * into m;
  perform analytics_private.capture_equity(p_user_id);
  return m;
end; $$;
revoke all on function public.open_margin_position(uuid,uuid,text,numeric,integer,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.open_margin_position(uuid,uuid,text,numeric,integer,uuid,numeric,numeric) to service_role;

create function public.close_margin_position(p_user_id uuid,p_position_id uuid,p_automatic boolean default false)
returns public.margin_positions language plpgsql security definer set search_path='' as $$
declare m public.margin_positions%rowtype; a public.assets%rowtype; price numeric; pnl numeric; reason text;
begin
  -- Same lock order for manual closes, automated exits and new orders.
  perform 1 from public.profiles where id=p_user_id for update;
  select * into m from public.margin_positions where id=p_position_id and user_id=p_user_id for update;
  if not found then raise exception 'POSITION_NOT_FOUND'; end if;
  if m.closed_at is not null then return m; end if;
  select * into a from public.assets where id=m.asset_id for share;
  if a.price_updated_at is null or a.price_updated_at not between now()-interval '120 seconds' and now()+interval '5 seconds'
    or a.current_price::text in('NaN','Infinity','-Infinity') or a.sell_price::text in('NaN','Infinity','-Infinity')
    or a.current_price<=0 or a.sell_price is null or a.sell_price<=0 or a.sell_price>a.current_price or not a.is_tradable or a.currency<>'USD' then raise exception 'QUOTE_STALE_OR_UNAVAILABLE'; end if;
  price:=case when m.side='BUY' then a.sell_price else a.current_price end;
  pnl:=round((price-m.entry_price)*m.quantity*case when m.side='BUY' then 1 else -1 end,2);
  reason:=case when pnl<=-m.investment then 'liquidation'
    when pnl<=-m.stop_loss_amount then 'stop_loss' when pnl>=m.take_profit_amount then 'take_profit' else 'manual' end;
  if p_automatic and reason='manual' then return m; end if;
  pnl:=greatest(-m.investment,pnl); -- Isolated demo margin: losses cannot exceed reserved capital.
  update public.profiles set fictional_balance=fictional_balance+m.investment+pnl where id=p_user_id;
  update public.margin_positions set closed_at=now(),exit_price=price,realized_pnl=pnl,close_reason=reason,
    balance_after=(select fictional_balance from public.profiles where id=p_user_id)
    where id=m.id returning * into m;
  perform analytics_private.capture_equity(p_user_id);
  return m;
end; $$;
revoke all on function public.close_margin_position(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.close_margin_position(uuid,uuid,boolean) to service_role;

-- Evaluate exits independently of browsers. Gaps execute at the available quote,
-- not at a guaranteed TP/SL price. Stale/unavailable instruments wait for a new quote.
create function analytics_private.evaluate_margin_exits() returns void language plpgsql security definer set search_path='' as $$
declare m record;
begin
  for m in select id,user_id from public.margin_positions where closed_at is null order by user_id,id loop
    begin
      perform public.close_margin_position(m.user_id,m.id,true);
    exception when raise_exception then
      if sqlerrm<>'QUOTE_STALE_OR_UNAVAILABLE' then raise; end if;
    end;
  end loop;
end; $$;
revoke all on function analytics_private.evaluate_margin_exits() from public,anon,authenticated,service_role;
select cron.schedule('bullvest-margin-exits','* * * * *','select analytics_private.evaluate_margin_exits()');

-- Net equity includes reserved margin plus open P/L, never the leveraged notional.
create or replace view analytics_private.live_equity with(security_invoker=true) as
select p.id user_id, p.fictional_balance+coalesce(s.equity,0)+coalesce(m.equity,0) as equity,
  coalesce(s.fresh,true) and coalesce(m.fresh,true) as quotes_fresh
from public.profiles p
left join lateral (select sum(h.total_quantity*a.current_price) equity,
  bool_and(coalesce(a.price_updated_at between now()-interval '120 seconds' and now()+interval '5 seconds',false)) fresh
  from public.portfolios h join public.assets a on a.id=h.asset_id where h.user_id=p.id) s on true
left join lateral (select sum(case when a.sell_price>0 and a.sell_price<=a.current_price then greatest(0,h.investment+(case when h.side='BUY' then a.sell_price-h.entry_price else h.entry_price-a.current_price end)*h.quantity) else h.investment end) equity,
  bool_and(coalesce(a.price_updated_at between now()-interval '120 seconds' and now()+interval '5 seconds' and a.sell_price>0 and a.sell_price<=a.current_price,false)) fresh
  from public.margin_positions h join public.assets a on a.id=h.asset_id where h.user_id=p.id and h.closed_at is null) m on true;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='assets') then
    alter publication supabase_realtime add table public.assets;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='margin_positions') then
    alter publication supabase_realtime add table public.margin_positions;
  end if;
end; $$;
commit;
