begin;

-- Una solicitud por cuenta. Solicitar Pro no cambia el rol ni inicia un cobro.
create table public.pro_upgrade_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.pro_upgrade_requests enable row level security;

create policy pro_requests_read_own
  on public.pro_upgrade_requests for select to authenticated
  using (user_id = (select auth.uid()));

create policy pro_requests_insert_own_free
  on public.pro_upgrade_requests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'free'
    )
  );

revoke all on public.pro_upgrade_requests from anon, authenticated;
grant select, insert (user_id) on public.pro_upgrade_requests to authenticated;
grant all on public.pro_upgrade_requests to service_role;

comment on table public.pro_upgrade_requests is
  'Solicitudes de interes en Pro, para revision administrativa; no activa suscripciones.';

commit;
