begin;
create or replace function analytics_private.alert_insert_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Reject impersonation before locking or inspecting another user's quota.
  if auth.uid() is not null and new.user_id<>auth.uid() then
    raise exception 'UNAUTHORIZED' using errcode='42501';
  end if;
  perform 1 from public.profiles where id=new.user_id for update;
  if (select count(*) from public.price_alerts where user_id=new.user_id)>=100 then raise exception 'ALERT_LIMIT_REACHED'; end if;
  return new;
end;
$$;
revoke all on function analytics_private.alert_insert_guard() from public,anon,authenticated;
alter table public.price_alerts add constraint triggered_price_required
  check(status<>'triggered' or triggered_price is not null);
commit;
