begin;

update public.assets set is_tradable = true where is_tradable is not true;

-- BullVest stores Ask in current_price and Bid in sell_price. There are no
-- separate price/ask/bid columns. Preserve good quotes; repair invalid pairs.
-- A missing reference price uses a simulated mid of USD 100. Existing valid
-- Ask prices are preserved by deriving the mid from Ask / 1.0015.
with repair as materialized (
  select id,
    case when current_price is null or current_price <= 0
      or current_price::text in ('NaN', 'Infinity', '-Infinity')
      then 100.00::numeric else current_price / 1.0015 end as price
  from public.assets
  where current_price is null or current_price <= 0
    or current_price::text in ('NaN', 'Infinity', '-Infinity')
    or sell_price is null or sell_price <= 0
    or sell_price::text in ('NaN', 'Infinity', '-Infinity')
    or sell_price > current_price
)
update public.assets a
set current_price = greatest(0.00000001::numeric, round(r.price * 1.0015, 8)),
    sell_price = greatest(0.00000001::numeric, round(r.price * 0.9985, 8))
from repair r where a.id = r.id;

-- Eight decimals are intentional: four would turn micro-priced crypto to zero.
-- Renew all simulated quotes so unlocking also clears the 120-second gate.
update public.assets
set price_updated_at = now(), updated_at = now(),
    price_source = 'simulated', quote_is_delayed = false;

-- Accommodate deployments that have either optional status column.
do $$
declare status_column text;
begin
  for status_column in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'assets'
      and column_name in ('status', 'trading_status')
  loop
    execute format('update public.assets set %I = ''active'' where %I is distinct from ''active''',
      status_column, status_column);
  end loop;
end;
$$;

commit;
