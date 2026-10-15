begin;
create table private.stripe_checkout_attempts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  request_id uuid not null default gen_random_uuid(),
  price_id text not null,
  origin text not null,
  generation text not null,
  valid_until timestamptz not null default (now() + interval '23 hours')
);
alter table private.stripe_checkout_attempts enable row level security;

-- Serialize checkout initialization across tabs, plans and midnight boundaries.
-- Stripe retains idempotency keys for at least 24 hours; use a shorter lease.
create function public.reserve_stripe_checkout(
  p_user_id uuid, p_price_id text, p_origin text, p_generation text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_attempt private.stripe_checkout_attempts%rowtype;
begin
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  insert into private.stripe_checkout_attempts(profile_id,price_id,origin,generation)
    values(p_user_id,p_price_id,p_origin,p_generation)
    on conflict (profile_id) do update set request_id=gen_random_uuid(),
      price_id=excluded.price_id, origin=excluded.origin, generation=excluded.generation,
      valid_until=excluded.valid_until
    where private.stripe_checkout_attempts.valid_until < now()
      or private.stripe_checkout_attempts.generation <> excluded.generation;
  select * into strict v_attempt from private.stripe_checkout_attempts where profile_id=p_user_id;
  if v_attempt.price_id <> p_price_id or v_attempt.origin <> p_origin then
    raise exception 'CHECKOUT_ALREADY_OPEN';
  end if;
  return v_attempt.request_id;
end;
$$;
revoke all on function public.reserve_stripe_checkout(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.reserve_stripe_checkout(uuid,text,text,text) to service_role;
commit;
