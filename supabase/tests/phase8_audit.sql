-- Integration audit against the linked schema. All fixtures and changes roll back.
begin;
set local statement_timeout='30s';
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'AUDIT FAILED: %',message; end if; end; $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('f8000000-0000-4000-8000-000000000001','phase8-a@example.invalid','{"display_name":"Audit A"}'),
 ('f8000000-0000-4000-8000-000000000002','phase8-b@example.invalid','{"display_name":"private@example.invalid"}');
update public.profiles set fictional_balance=case when id='f8000000-0000-4000-8000-000000000001' then 10000 else 1100 end
 where id in ('f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000002');
update public.performance_baselines set equity=1000,started_at=now()-interval '10 days'
 where user_id in ('f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000002');
insert into public.life_reloads_log(user_id,balance_before,balance_after,lives_after_reload,was_pro)
 values('f8000000-0000-4000-8000-000000000001',1000,10000,2,false);
update public.portfolio_cash_flows set occurred_at=now()-interval '1 day'
 where user_id='f8000000-0000-4000-8000-000000000001';
insert into public.equity_snapshots(user_id,snapshot_date,equity,observed_at,quotes_fresh) values
 ('f8000000-0000-4000-8000-000000000001',(now() at time zone 'UTC')::date-2,1000,now()-interval '2 days',true),
 ('f8000000-0000-4000-8000-000000000002',(now() at time zone 'UTC')::date-2,1200,now()-interval '2 days',true),
 ('f8000000-0000-4000-8000-000000000002',(now() at time zone 'UTC')::date-1,1150,now()-interval '1 day',true);
insert into public.transactions(user_id,asset_id,transaction_type,quantity,execution_price,total_value,balance_after,position_after,client_request_id,realized_pnl)
 select 'f8000000-0000-4000-8000-000000000001',a.id,'SELL',1,100,100,10000,0,gen_random_uuid(),p.pnl
 from public.assets a cross join (values(10),(-5)) p(pnl) where a.ticker='AAPL';
insert into public.user_academy_progress(user_id,lesson_id,completed,completed_at,score)
 select 'f8000000-0000-4000-8000-000000000001',id,true,now(),100 from public.lessons limit 1;
select pg_temp.assert_true((select amount=9000 from public.portfolio_cash_flows where user_id='f8000000-0000-4000-8000-000000000001'),'reload captured as external cash flow');
select pg_temp.assert_true((select equity=10000 from public.equity_snapshots where user_id='f8000000-0000-4000-8000-000000000001' and snapshot_date=(now() at time zone 'UTC')::date),'trade/reload captured current equity');
update public.assets set current_price=100,price_updated_at=now() where ticker='AAPL';

select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.profiles),'profile RLS');
select pg_temp.assert_true((select count(*)=1 from public.performance_baselines),'baseline RLS');
select pg_temp.assert_true(not exists(select 1 from public.equity_snapshots where user_id<>'f8000000-0000-4000-8000-000000000001'),'snapshot RLS');
select pg_temp.assert_true((select roi_pct=0 from public.get_global_leaderboard() where user_id='f8000000-0000-4000-8000-000000000001'),'reload is not a gain');
select pg_temp.assert_true((select roi_pct=10 and display_name not like '%@%' from public.get_global_leaderboard() where user_id='f8000000-0000-4000-8000-000000000002'),'ROI 10 percent and no email exposed');
select pg_temp.assert_true((select abs(roi_pct-(-100.0/12))<0.00001 from public.get_global_leaderboard('week') where user_id='f8000000-0000-4000-8000-000000000002'),'weekly uses available in-window starting point');
select pg_temp.assert_true((select roi_pct=10 from public.get_global_leaderboard('month') where user_id='f8000000-0000-4000-8000-000000000002'),'monthly baseline differs from weekly');
select pg_temp.assert_true((select count(*)=1 from public.get_global_leaderboard('all',1,1)),'pagination');
select pg_temp.assert_true((select win_rate_pct=50 and sell_count=2 from public.get_trading_statistics()),'win rate 1/2');
select pg_temp.assert_true((select trade_count=2 and completed_lessons=1 and badges @> array['first_trade','first_win','first_lesson'] from public.get_my_achievements()),'earned badges');
select pg_temp.assert_true((select count(*)=3 and max(equity)=10000 and max(return_pct)=0 from public.get_portfolio_performance()),'own curve and flow-adjusted return');
insert into public.trader_follows(user_id,followed_user_id) values('f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select count(*)=1 and bool_and(is_following) from public.get_global_leaderboard('all',20,0,true)),'follow filter');
do $$ begin
  begin insert into public.trader_follows(user_id,followed_user_id) values('f8000000-0000-4000-8000-000000000002','f8000000-0000-4000-8000-000000000001'); raise exception 'follow impersonation allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.equity_snapshots(user_id,snapshot_date,equity,observed_at,quotes_fresh) values(auth.uid(),current_date-3,999999,now(),true); raise exception 'equity tampering allowed'; exception when insufficient_privilege then null; end;
  begin perform * from public.get_global_leaderboard('invalid'); raise exception 'invalid period accepted'; exception when raise_exception then if sqlerrm<>'INVALID_PERIOD' then raise; end if; end;
end; $$;
insert into public.price_alerts(user_id,asset_id,direction,target_price)
 select auth.uid(),id,'above',99 from public.assets where ticker='AAPL';
select pg_temp.assert_true((select status='triggered' and triggered_price=100 from public.price_alerts),'immediate fresh alert');
update public.price_alerts set read_at=now();
select pg_temp.assert_true((select read_at is not null from public.price_alerts),'mark read permitted');
do $$ begin
  begin update public.price_alerts set status='active'; raise exception 'alert status tampering allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.price_alerts(user_id,asset_id,direction,target_price) select 'f8000000-0000-4000-8000-000000000002',id,'above',99 from public.assets limit 1; raise exception 'alert impersonation allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.price_alerts),'other alerts invisible');
select pg_temp.assert_true((select count(*)=0 from public.trader_follows),'other follow list invisible');
select pg_temp.assert_true((select count(*)=0 from public.portfolio_cash_flows),'other cash flows invisible');
select pg_temp.assert_true((select sell_count=0 and win_rate_pct is null from public.get_trading_statistics()),'other statistics isolated');
delete from public.price_alerts;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.assets set price_updated_at=now()-interval '5 minutes' where ticker='AAPL';
insert into public.price_alerts(user_id,asset_id,direction,target_price)
 select 'f8000000-0000-4000-8000-000000000002',id,'below',101 from public.assets where ticker='AAPL';
select pg_temp.assert_true((select status='active' from public.price_alerts where user_id='f8000000-0000-4000-8000-000000000002'),'stale price does not trigger');
update public.assets set price_updated_at=now() where ticker='AAPL';
select pg_temp.assert_true((select status='triggered' and triggered_price=100 from public.price_alerts where user_id='f8000000-0000-4000-8000-000000000002'),'quote refresh triggers pending alert');
update public.assets set current_price=98 where ticker='AAPL';
select pg_temp.assert_true((select triggered_price=100 and read_at is not null from public.price_alerts where user_id='f8000000-0000-4000-8000-000000000001'),'trigger is one-shot, other user cannot delete');
set local role anon;
do $$ begin
  begin perform * from public.get_global_leaderboard(); raise exception 'anonymous ranking allowed'; exception when insufficient_privilege then null; end;
  begin perform * from public.price_alerts; raise exception 'anonymous alerts allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select pg_temp.assert_true(exists(select 1 from cron.job where jobname='bullvest-equity-snapshots' and active and schedule='*/5 * * * *'),'equity cron scheduled');
rollback;
select 'PASS: Phase 8 ROI, cash flows, periods, win rate, badges, follows, alerts, cron and RLS; fixtures rolled back' as result;
