-- Execute after the migration; fixtures and all changes always roll back.
begin;
set local statement_timeout='30s';
select set_config('bullvest.margin_user',gen_random_uuid()::text,true);
select set_config('bullvest.margin_asset',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values(current_setting('bullvest.margin_user')::uuid,current_setting('bullvest.margin_user')||'@margin-audit.invalid','{}');
insert into public.assets(id,ticker,name,asset_type,currency,current_price,sell_price,price_updated_at,is_tradable)
values(current_setting('bullvest.margin_asset')::uuid,'AUD'||upper(substr(current_setting('bullvest.margin_asset'),1,6)),'Margin audit','stock','USD',100,99,now(),true);
do $$
declare u uuid:=current_setting('bullvest.margin_user')::uuid; a uuid:=current_setting('bullvest.margin_asset')::uuid;
  r uuid:=gen_random_uuid(); m public.margin_positions; replay public.margin_positions; cash numeric; eq numeric;
begin
  m:=public.open_margin_position(u,a,'BUY',100,10,r,50,100);
  if m.quantity<>10 or m.entry_price<>100 or m.balance_after<>9900 or m.commission<>0 then raise exception 'Opening accounting'; end if;
  select equity into eq from analytics_private.live_equity where user_id=u;
  if eq<>9990 then raise exception 'Margin equity should include spread, got %',eq; end if;
  replay:=public.open_margin_position(u,a,'BUY',100,10,r,50,100);
  if m.id<>replay.id or (select fictional_balance from public.profiles where id=u)<>9900 then raise exception 'Duplicate margin debit'; end if;
  begin
    perform public.open_margin_position(u,a,'BUY',100,5,r,50,100);
    raise exception 'Different payload reused request ID';
  exception when raise_exception then if sqlerrm<>'REQUEST_ID_REUSED_WITH_DIFFERENT_ORDER' then raise; end if; end;
  begin
    perform public.open_margin_position(u,a,'BUY',100,100,gen_random_uuid(),null,null);
    raise exception 'Spread exhausted margin accepted';
  exception when raise_exception then if sqlerrm<>'MARGIN_TOO_SMALL_FOR_SPREAD' then raise; end if; end;
  begin
    perform public.open_margin_position(u,a,'BUY',100,3,gen_random_uuid(),null,null);
    raise exception 'Invalid multiplier accepted';
  exception when raise_exception then if sqlerrm<>'INVALID_MARGIN_ORDER' then raise; end if; end;
  begin
    perform public.open_margin_position(u,a,'BUY',10001,1,gen_random_uuid(),null,null);
    raise exception 'Insufficient cash accepted';
  exception when raise_exception then if sqlerrm<>'INSUFFICIENT_FICTIONAL_FUNDS' then raise; end if; end;
  update public.assets set current_price=111,sell_price=110,price_updated_at=now() where id=a;
  perform analytics_private.evaluate_margin_exits();
  select * into m from public.margin_positions where id=m.id;
  if m.close_reason<>'take_profit' or m.realized_pnl<>100 or m.balance_after<>10100 then raise exception 'Take profit accounting'; end if;
  replay:=public.close_margin_position(u,m.id,false);
  if replay.id<>m.id or (select fictional_balance from public.profiles where id=u)<>10100 then raise exception 'Duplicate close credit'; end if;
  update public.assets set current_price=100,sell_price=99 where id=a;
  m:=public.open_margin_position(u,a,'SELL',100,10,gen_random_uuid(),20,50);
  update public.assets set current_price=102,sell_price=101 where id=a;
  perform analytics_private.evaluate_margin_exits();
  select * into m from public.margin_positions where id=m.id;
  if m.close_reason<>'stop_loss' or m.realized_pnl<>-30.30 then raise exception 'Short stop accounting: %',m.realized_pnl; end if;
  update public.assets set current_price=100,sell_price=99 where id=a;
  m:=public.open_margin_position(u,a,'BUY',100,10,gen_random_uuid(),null,null);
  update public.assets set current_price=81,sell_price=80,price_updated_at=now()-interval '10 minutes' where id=a;
  perform analytics_private.evaluate_margin_exits();
  if (select closed_at from public.margin_positions where id=m.id) is not null then raise exception 'Stale price closed position'; end if;
  update public.assets set price_updated_at=now() where id=a;
  perform analytics_private.evaluate_margin_exits();
  select * into m from public.margin_positions where id=m.id;
  if m.close_reason<>'liquidation' or m.realized_pnl<>-100 then raise exception 'Isolated margin loss cap'; end if;
  begin
    perform public.close_margin_position(gen_random_uuid(),m.id,false);
    raise exception 'Another user closed position';
  exception when raise_exception then if sqlerrm<>'POSITION_NOT_FOUND' then raise; end if; end;
  if has_function_privilege('authenticated','public.open_margin_position(uuid,uuid,text,numeric,integer,uuid,numeric,numeric)','EXECUTE')
    or has_function_privilege('anon','public.close_margin_position(uuid,uuid,boolean)','EXECUTE') then raise exception 'Public margin RPC access'; end if;
end; $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.margin_positions) then raise exception 'RLS leaked another account'; end if;
  begin
    update public.margin_positions set investment=1;
    raise exception 'Direct position UPDATE accepted';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
select 'margin_trading_audit: PASS (rolled back)' as result;
