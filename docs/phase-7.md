# Fase 7: Stripe, Google y tres vidas

Entorno acordado: Stripe **Test Mode**, frontend en `http://localhost:5173`, Supabase `zgycwhxwpxbqtivgssml`.

## Configuración pendiente del propietario

En [Edge Function Secrets](https://supabase.com/dashboard/project/zgycwhxwpxbqtivgssml/functions/secrets), configurar:

| Variable | Valor |
| --- | --- |
| `STRIPE_SECRET_KEY` | Clave secreta de prueba `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Firma `whsec_…` del endpoint registrado abajo |
| `STRIPE_PRICE_ID` | Precio recurrente de prueba `price_…` de BullVest Pro |
| `APP_ALLOWED_ORIGINS` | Ya configurada: `http://localhost:5173,http://127.0.0.1:5173` |
| `STRIPE_ANNUAL_PRICE_ID` | Opcional: segundo precio recurrente anual |

Supabase proporciona automáticamente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Ninguna clave secreta se utiliza en React. Para ofrecer ambos intervalos, usar el precio mensual en `STRIPE_PRICE_ID`, configurar el anual y añadir `VITE_STRIPE_ANNUAL_ENABLED=true` en `.env.local`. Si solo se configura `STRIPE_PRICE_ID`, su periodicidad la determina el precio en Stripe. El importe se presenta en Checkout antes de confirmar; no se inventa un precio en el frontend.

Crear en Stripe, en modo prueba, un destino de eventos con esta URL:

```text
https://zgycwhxwpxbqtivgssml.supabase.co/functions/v1/stripe-webhook
```

Suscribirlo a `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` e `invoice.paid`. También se soportan `invoice.payment_succeeded` y `checkout.session.async_payment_succeeded`. Copiar el secreto de **ese destino** a `STRIPE_WEBHOOK_SECRET`. Las funciones utilizan Stripe SDK 23.0.0; la firma se verifica sobre el cuerpo original. Activar el [Customer Portal de prueba](https://dashboard.stripe.com/test/settings/billing/portal) con actualización de método de pago y cancelación de suscripción.

En [Auth / Providers](https://supabase.com/dashboard/project/zgycwhxwpxbqtivgssml/auth/providers), activar Google e introducir el OAuth Client ID y Client Secret de una aplicación web. En Google Cloud:

- Origen autorizado: `http://localhost:5173`.
- URI de redirección: `https://zgycwhxwpxbqtivgssml.supabase.co/auth/v1/callback`.
- Añadir usuarios de prueba si la pantalla de consentimiento está en modo Testing.

En [Auth / URL Configuration](https://supabase.com/dashboard/project/zgycwhxwpxbqtivgssml/auth/url-configuration), establecer Site URL en `http://localhost:5173` y permitir `http://localhost:5173/dashboard` (y el equivalente `127.0.0.1` si se utiliza). `supabase/config.toml` configura estas URLs para desarrollo local, **no modifica por sí solo Auth en la nube**. Google estaba deshabilitado al verificar esta fase.

Referencias: [Google OAuth en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [webhooks de suscripciones](https://docs.stripe.com/billing/subscriptions/webhooks), [sesiones del portal](https://docs.stripe.com/api/customer_portal/sessions/create).

## Comportamiento implementado

- Correo y Google crean perfiles Free con tres vidas y 10.000 USD ficticios. El nombre admite `display_name`, `full_name` y `name`; los metadatos del usuario nunca controlan el plan, vidas o saldo.
- `refill_portfolio_balance()` toma exclusivamente `auth.uid()`, bloquea la fila, establece el saldo en 10.000 y registra la recarga. Free consume una vida; Pro no consume ninguna; Free con cero vidas recibe `NO_FREE_LIVES_REMAINING`. Las posiciones se conservan. No hay condición de saldo menor de 100 USD ni necesidad de cerrar posiciones.
- No se modifica el saldo de cuentas existentes al migrar. La vía antigua de recarga `use_life_reload` conserva los mismos límites y el importe de 10.000, y sigue reservada a `service_role`.
- Checkout usa precios del servidor, valida el JWT con `auth.getUser`, guarda el Customer y bloquea nuevas compras si ya existe una suscripción pendiente o activa. Una reserva SQL y claves de idempotencia de Stripe coordinan solicitudes simultáneas. Las sesiones abiertas se reutilizan; para cambiar de plan durante una sesión pendiente debe esperarse su expiración.
- El webhook actualiza `role`, IDs y estado de Stripe. Deduplica eventos y consulta las suscripciones actuales para evitar aplicar instantáneas obsoletas. `invoice.payment_failed` retira Pro cuando la factura actual sigue impagada; `invoice.paid` restaura el acceso al recuperarse el pago. Una cancelación al final del periodo conserva Pro hasta que la suscripción termine.
- `refreshProfile()` se ejecuta sin desmontar la ruta. Realtime y el retorno del foco actualizan cambios del portal. `/checkout/success` espera hasta 30 segundos, ofrece reintento y no concede Pro por parámetros de URL.
- Navbar, Dashboard, Academia y modal de vidas agotadas usan Stripe. Las antiguas solicitudes de interés permanecen como histórico, sin CTAs activos.

## Comandos ejecutados

```sh
npm install @stripe/stripe-js
npx supabase migration new stripe_subscriptions_and_three_lives
npx supabase db push --dry-run
npx supabase db push --yes
npx supabase migration new billing_checkout_reservations
npx supabase db push --yes
npx supabase gen types typescript --linked --schema public
npx supabase secrets set APP_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
npx supabase functions deploy create-checkout-session create-portal-session stripe-webhook --use-api
npx supabase functions deploy create-checkout-session --use-api
npx supabase db query --linked --file supabase/tests/subscription_lives_audit.sql
npx supabase db advisors --linked --type security --level warn
npx supabase migration list --linked
npx supabase functions list
```

La salida de `gen types` se validó en un archivo temporal antes de sustituir `src/types/database.types.ts`. Se aplicaron `20261015154059_stripe_subscriptions_and_three_lives.sql` y `20261015155116_billing_checkout_reservations.sql`.

## Verificación

Usar Node 24 (`nvm use`); el Node 18 predeterminado de este equipo es demasiado antiguo para las dependencias existentes de Vite y Supabase.

```sh
npm run build
npm run lint
npm test
npm run test:billing
npx playwright test
npx deno check --config supabase/functions/create-checkout-session/deno.json supabase/functions/create-checkout-session/index.ts supabase/functions/create-portal-session/index.ts supabase/functions/stripe-webhook/index.ts
```

La auditoría SQL crea usuarios temporales, comprueba defaults OAuth, aislamiento RLS, permisos, tres recargas Free, Pro con cero vidas, eventos repetidos/fuera de orden y reservas de Checkout, y revierte todos los datos. Las pruebas Deno comprueban firmas auténticas, cuerpos alterados, firmas antiguas, estados de suscripción y CORS/auth. Playwright utiliza respuestas simuladas de Supabase y Stripe: no cobra ni crea suscripciones.

Los endpoints desplegados respondieron 204 al preflight permitido, 401 sin autenticación, 403 a un origen no permitido y 400 a un webhook sin firma. El linter de Supabase informa del uso intencional de `SECURITY DEFINER` en la RPC autenticada de recarga (comprueba identidad y no acepta IDs). Permanecen avisos preexistentes de Academia y `rls_auto_enable`; [detalle del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Vite mantiene el aviso previo de bundle superior a 500 kB.

La prueba completa con Google real y un pago Stripe de prueba queda pendiente de las credenciales y configuración anteriores. Tras configurarlas, comprobar registro Google, pago, retorno Pro, cancelación desde el portal, fallo de renovación y recuperación del pago.

Resultado de esta entrega: build y lint correctos con Node 24; siete pruebas unitarias, tres pruebas Deno y trece casos Playwright aprobados. Los cuatro casos de Academia agotaron inicialmente el tiempo de arranque mientras corría la compilación en paralelo y pasaron al repetirlos con dos workers. La auditoría SQL remota pasó y el historial local/remoto coincide.
