# BullVest — Fase 4: Paper Trading

Incluye código frontend y Edge Function necesaria para invocar las RPC financieras **sin exponer `service_role`**. Compatible con SQL V1 (ver `bullvest_supabase_v1.sql`) y AuthContext de Fase 3.

## Integración

1. Copia `src/features/trading/services/tradingService.ts`, `components/OrderForm.tsx` y `pages/SimulatorPage.tsx` sobre tu proyecto Vite.
2. Comprueba que existen `src/lib/supabase.ts` y los tipos **reales** en `src/types/database.types.ts` (generados desde el Supabase que ya tiene el SQL V1).
3. Copia `supabase/functions/trading/index.ts` en la misma ruta de tu proyecto.
4. `npx supabase functions deploy trading` (CLI vinculado al proyecto).
5. Activa el refresco simulado descrito abajo. El catálogo `public.assets` debe estar poblado con precios positivos. El navegador NO puede escribir cotizaciones directamente. La RPC de trading rechaza precios anteriores a 120 segundos.
6. `npm run build`, `npm run dev`.

## Seguridad

- La función `execute_trade(p_user_id,p_asset_id,p_type,p_quantity,p_price,p_request_id)` y `use_life_reload(p_user_id)` del esquema V1 están restringidas a `service_role`. No hagas `supabase.rpc()` de ellas en el frontend.
- `withSupabase({ auth: 'user' })` valida el token JWT; la Edge Function obtiene el `userId` del token y el `p_price` del catálogo de activos (no de datos del cliente).
- La función usa idempotencia mediante `client_request_id`. Ante un error de red, reintenta el mismo UUID para la misma orden.
- El backend SQL hace la comprobación definitiva de saldo, cantidad, cotización y condiciones de recarga con bloqueos transaccionales.
- Antes de producción, implementa rate-limiting durable, monitorización, auditoría con dos usuarios y una ingesta de mercado acorde a las licencias del proveedor. Cualquier precio sin ingesta reciente inhabilitará operar.

## Alcance

Incluye cotizaciones sintéticas con una variación aleatoria de hasta ±1 % por refresco (redondeada a 8 decimales). No incluye la contratación o configuración de un proveedor de datos de mercado.

## Activar las cotizaciones simuladas

1. Aplica `supabase/migrations/20261014_refresh_asset_prices.sql` en la base de datos existente, mediante SQL Editor o el flujo de migraciones del proyecto. Requiere el esquema V1 y no crea ni siembra `assets`.
2. Despliega la Edge Function `refresh-quotes`, incluyendo su `deno.json` y `deno.lock`, con el mismo flujo usado para `trading`. Conserva `verify_jwt = true`.
3. Abre el simulador con una sesión iniciada. `triggerQuoteRefresh()` invoca la Edge Function antes de leer el catálogo. También se refresca cada 60 segundos mientras la vista está visible, al regresar a la pestaña y con el botón Actualizar. Los temporizadores se limpian al salir y se pausan durante las operaciones.

La función SQL actualiza `current_price`, `updated_at` y **`price_updated_at`**, que es el timestamp que validan `OrderForm` y el backend. Marca `price_source = 'simulated'` y `quote_is_delayed = false`. Cada llamada modifica el catálogo compartido para todos los usuarios; no hay un proceso programado cuando nadie utiliza el simulador.

La RPC solo permite `service_role`. La Edge Function valida la sesión antes de usar el cliente administrativo; ninguna clave privada se añade al frontend. Véase la [documentación de autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth). Si el refresco falla, se muestra un error con opción de reintento y las órdenes permanecen deshabilitadas.
