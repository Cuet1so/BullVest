begin;

-- Cotizaciones sinteticas para el simulador; no son precios de mercado reales.
create or replace function public.refresh_asset_prices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  refreshed_count integer;
begin
  update public.assets
  set current_price = greatest(
        0.00000001::numeric,
        round(current_price * (0.99::numeric + random()::numeric * 0.02), 8)
      ),
      price_updated_at = now(),
      updated_at = now(),
      price_source = 'simulated',
      quote_is_delayed = false;

  get diagnostics refreshed_count = row_count;
  return refreshed_count;
end;
$$;

-- Solo el backend autenticado puede modificar el catalogo compartido.
revoke all on function public.refresh_asset_prices() from public, anon, authenticated;
grant execute on function public.refresh_asset_prices() to service_role;

commit;
