-- Auditoria de la RPC y del trading SQL. Todo dato de prueba se revierte.
-- Ejecutar el archivo entero, con parada ante errores, en el esquema BullVest V1.
begin;

do $$
declare
  audit_user_id uuid := gen_random_uuid();
  audit_asset public.assets%rowtype;
  initial_balance numeric;
  buy_result record;
  sell_result record;
  stale_rejected boolean := false;
begin
  select * into strict audit_asset from public.assets where ticker = 'AAPL';

  -- Usuario efimero, creado y eliminado por ROLLBACK, sin enviar correos.
  insert into auth.users (id, email, raw_user_meta_data)
  values (audit_user_id, audit_user_id::text || '@audit.invalid',
          '{"display_name":"Quote refresh audit"}'::jsonb);
  select fictional_balance into strict initial_balance
  from public.profiles where id = audit_user_id;

  update public.assets set price_updated_at = now() - interval '121 seconds'
  where id = audit_asset.id;
  begin
    perform public.execute_trade(audit_user_id, audit_asset.id, 'BUY', 1,
                                 audit_asset.current_price, gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'QUOTE_STALE_OR_UNAVAILABLE' then raise; end if;
    stale_rejected := true;
  end;
  if not stale_rejected then raise exception 'Stale quote was accepted'; end if;

  perform public.refresh_asset_prices();
  if exists (select 1 from public.assets
             where price_updated_at is distinct from now()
                or updated_at is distinct from now()) then
    raise exception 'Refresh did not set both timestamps to NOW()';
  end if;
  select * into strict audit_asset from public.assets where id = audit_asset.id;

  select * into strict buy_result
  from public.execute_trade(audit_user_id, audit_asset.id, 'BUY', 1,
                            audit_asset.current_price, gen_random_uuid());
  if buy_result.position_quantity <> 1
     or buy_result.resulting_balance <> initial_balance - round(audit_asset.current_price, 2) then
    raise exception 'BUY result is incorrect';
  end if;

  select * into strict sell_result
  from public.execute_trade(audit_user_id, audit_asset.id, 'SELL', 1,
                            audit_asset.current_price, gen_random_uuid());
  if sell_result.position_quantity <> 0
     or sell_result.resulting_balance <> initial_balance then
    raise exception 'SELL result is incorrect';
  end if;
  if (select count(*) from public.transactions where user_id = audit_user_id) <> 2
     or exists (select 1 from public.portfolios where user_id = audit_user_id) then
    raise exception 'Unexpected transactions or remaining position';
  end if;
end;
$$;

rollback;
select 'PASS: stale quote rejected; refresh, BUY and SELL succeeded; test data rolled back' as audit_result;
