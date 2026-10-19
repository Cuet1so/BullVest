# Market ticker

Cada POST ejecuta un tick sobre hasta 10 activos distintos, elegidos al azar de
todo el catálogo con precios válidos. Si hay menos de 10, actualiza los disponibles.

BullVest guarda Ask en `current_price` y Bid en `sell_price`. Se recupera su precio
medio, se aplica una variación uniforme entre -0,3 % y +0,3 %, y se guardan
`Ask = precio * 1.001` y `Bid = precio * 0.999` con ocho decimales. Sin Bid válido,
el precio de referencia se obtiene de `current_price / 1.001`. Se renuevan
`price_updated_at`, `updated_at` y los indicadores de cotización simulada.
Supabase Realtime distribuye los UPDATE mediante la suscripción existente.

El endpoint requiere la clave secreta `default` del proyecto en el encabezado
`apikey`; nunca debe enviarse desde el frontend. `verify_jwt = false` permite
estas llamadas de servidor y `withSupabase({ auth: 'secret' })` verifica la clave.

La función ejecuta **un tick por invocación**. Para un mercado continuo, un
programador externo o Supabase Cron debe invocar periódicamente
`POST /functions/v1/market-ticker`. Este cambio no crea un nuevo cron ni sustituye
el refresco existente. La selección aleatoria no garantiza que todos los activos
se actualicen dentro de 120 segundos.

Las escrituras son condicionales para no pisar cotizaciones concurrentes. La
respuesta distingue `updated_count`, `skipped_count` (conflictos) y `failed_count`.
Los fallos parciales devuelven HTTP 500; no hay reintentos automáticos de un tick
completo porque los activos que ya se actualizaron volverían a fluctuar.

Validación local:

```sh
npx deno check --config supabase/functions/market-ticker/deno.json supabase/functions/market-ticker/index.ts
npx deno test --allow-env --config supabase/functions/market-ticker/deno.json supabase/functions/market-ticker/index_test.ts
```
