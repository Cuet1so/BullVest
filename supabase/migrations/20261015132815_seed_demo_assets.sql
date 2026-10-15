begin;

-- Catalogo de demostracion autorizado: precios ficticios, no cotizaciones reales.
-- No sobrescribir activos que ya existan al aplicar esta migracion.
insert into public.assets (
  ticker, name, asset_type, currency, current_price,
  price_updated_at, updated_at, price_source, quote_is_delayed, is_tradable
)
values
  ('AAPL', 'Apple (demostración)', 'STOCK', 'USD', 200.00,
   now(), now(), 'simulated', false, true),
  ('MSFT', 'Microsoft (demostración)', 'STOCK', 'USD', 400.00,
   now(), now(), 'simulated', false, true),
  ('SPY', 'SPDR S&P 500 ETF (demostración)', 'ETF', 'USD', 500.00,
   now(), now(), 'simulated', false, true)
on conflict (ticker) do nothing;

commit;
