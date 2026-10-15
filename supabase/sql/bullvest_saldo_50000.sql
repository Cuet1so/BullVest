-- HISTÓRICO: sustituido por la Fase 7 (10.000 USD). No ejecutar en el esquema actual.
-- BullVest: capital ficticio inicial y recargas de 50.000 USD.
-- Ejecutar UNA VEZ en Supabase SQL Editor (o mediante el flujo de migraciones).
-- No cambia posiciones, operaciones ni recargas históricas de 10.000 USD.
-- Mantiene los permisos y la firma de use_life_reload del esquema V1.

begin;

-- Nuevos usuarios: saldo inicial de 50.000 USD mediante handle_new_user().
alter table public.profiles
  alter column fictional_balance set default 50000.00;

-- Nuevos registros de recarga: 50.000 USD; conservamos logs históricos de 10.000.
alter table public.life_reloads_log
  alter column balance_after set default 50000.00;

alter table public.life_reloads_log
  drop constraint if exists life_reloads_log_balance_after_check;
alter table public.life_reloads_log
  drop constraint if exists life_reloads_log_balance_after_valid;
alter table public.life_reloads_log
  add constraint life_reloads_log_balance_after_valid
  check (balance_after in (10000.00, 50000.00));

-- Las cuentas existentes sin actividad previa y con el saldo inicial
-- original reciben 50.000 USD. No se alteran carteras con operaciones.
update public.profiles as p
set fictional_balance = 50000.00
where p.fictional_balance = 10000.00
  and not exists (
    select 1 from public.transactions as t where t.user_id = p.id
  )
  and not exists (
    select 1 from public.portfolios as h where h.user_id = p.id
  )
  and not exists (
    select 1 from public.life_reloads_log as r where r.user_id = p.id
  );

-- Reposición de saldo a 50.000 USD, conservando todas las
-- validaciones de vidas, saldo mínimo y ausencia de posiciones.
create or replace function public.use_life_reload(p_user_id uuid)
returns table (
  reload_id uuid,
  resulting_balance numeric,
  remaining_lives smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_next_lives smallint;
  v_reload_id uuid;
begin
  if p_user_id is null then
    raise exception 'USER_ID_REQUIRED';
  end if;

  select * into v_profile from public.profiles
   where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.portfolios
     where user_id = p_user_id and total_quantity > 0
  ) then
    raise exception 'CLOSE_ALL_POSITIONS_BEFORE_RELOAD';
  end if;
  if v_profile.fictional_balance > 100.00 then
    raise exception 'RELOAD_ALLOWED_ONLY_WITH_100_OR_LESS';
  end if;
  if v_profile.role = 'free' and v_profile.lives_remaining = 0 then
    raise exception 'NO_FREE_LIVES_REMAINING';
  end if;

  v_next_lives := case
    when v_profile.role = 'pro' then v_profile.lives_remaining
    else v_profile.lives_remaining - 1
  end;

  update public.profiles
     set fictional_balance = 50000.00,
         lives_remaining = v_next_lives
   where id = p_user_id;

  insert into public.life_reloads_log (
    user_id, lives_after_reload, was_pro, balance_before, balance_after
  ) values (
    p_user_id, v_next_lives, (v_profile.role = 'pro'),
    v_profile.fictional_balance, 50000.00
  ) returning id into v_reload_id;

  return query select v_reload_id, 50000.00::numeric, v_next_lives;
end;
$$;

commit;
