# BullVest — Paper Trading, Dashboard y Academia

La Fase 7 incorpora Stripe Checkout/Customer Portal, Google OAuth y recargas de 10.000 USD con tres vidas Free. Consulta [configuración, despliegue y pruebas de la Fase 7](docs/phase-7.md). Los CTAs de solicitud manual de Pro descritos en las fases anteriores han sido sustituidos por Checkout. Para desarrollo, usar Node 24 (`nvm use`).

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
   El catálogo de demostración está en `supabase/migrations/20261015132815_seed_demo_assets.sql`: AAPL, MSFT y SPY, con precios iniciales ficticios de 200, 400 y 500 USD. Esta migración no sobrescribe tickers existentes.
2. Despliega la Edge Function `refresh-quotes`, incluyendo su `deno.json` y `deno.lock`, con el mismo flujo usado para `trading`. Conserva `verify_jwt = true`.
3. Abre el simulador con una sesión iniciada. `triggerQuoteRefresh()` invoca la Edge Function antes de leer el catálogo. También se refresca cada 60 segundos mientras la vista está visible, al regresar a la pestaña y con el botón Actualizar. Los temporizadores se limpian al salir y se pausan durante las operaciones.

La función SQL actualiza `current_price`, `updated_at` y **`price_updated_at`**, que es el timestamp que validan `OrderForm` y el backend. Marca `price_source = 'simulated'` y `quote_is_delayed = false`. Cada llamada modifica el catálogo compartido para todos los usuarios; no hay un proceso programado cuando nadie utiliza el simulador.

La RPC solo permite `service_role`. La Edge Function valida la sesión antes de usar el cliente administrativo; ninguna clave privada se añade al frontend. Véase la [documentación de autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth). Si el refresco falla, se muestra un error con opción de reintento y las órdenes permanecen deshabilitadas.

## Fase 5: dashboard y rendimiento

`/dashboard` muestra el patrimonio total, liquidez, valor de las posiciones, rentabilidad no realizada, distribución con Recharts, últimas cinco operaciones y estado Free/Pro. La cartera vacía muestra 100 % de liquidez, incluso con saldo cero. El gráfico se carga por separado para no incluir Recharts en la carga inicial.

`dashboardService.ts` consulta el perfil con posiciones y activos anidados en una sola petición para calcular `fictional_balance + sum(total_quantity * current_price)` con una lectura coherente. Las operaciones se consultan con su activo, orden descendente y límite de cinco. Las consultas usan el usuario autenticado y las políticas RLS existentes. Los índices por usuario y fecha y las vistas con `security_invoker` ya estaban disponibles; no fue necesaria otra RPC financiera.

El dashboard refresca las cotizaciones al entrar, cada 60 segundos mientras está visible y al regresar a la pestaña. Si el refresco falla, muestra los precios disponibles con una advertencia. Las cifras son orientativas y la rentabilidad corresponde solo a las posiciones abiertas; no representa la rentabilidad histórica total de la cuenta.

La migración `20261015135212_dashboard_pro_requests.sql` añade las solicitudes de Pro: una por usuario, visibles solo por su propietario y con inserción limitada a cuentas Free. El CTA registra interés; no cobra ni cambia el rol. Las solicitudes quedan disponibles en `public.pro_upgrade_requests` para revisión administrativa. Las Edge Functions existentes se reutilizan sin cambios.

Verificación:

- `npm run build` y `npm run lint`: tipos de la aplicación y lint.
- `npm test`: patrimonio, porcentajes, pérdidas, cantidades fraccionarias, saldo cero y precios inválidos.
- `npm run test:dashboard`: Playwright con Supabase simulado; escritorio, móvil, cartera vacía, cuenta Pro, solicitud persistente y recuperación de errores. En Windows utiliza Edge instalado; en otros sistemas requiere Chromium de Playwright.
- `npx supabase db query --linked --file supabase/tests/dashboard_rls_audit.sql`: prueba con dos usuarios bajo RLS y reversión de todos los datos de prueba.
- `npx supabase migration list`: confirmar que el historial local coincide con el remoto.

Los tipos de `src/types/database.types.ts` se regeneran desde el proyecto vinculado mediante `npx supabase gen types typescript --linked --schema public` después de `npx supabase db push`.

## Fase 6: academia interactiva

`/academia` ofrece una ruta de cinco niveles, con tres lecciones y tres preguntas por lección: estados financieros (Wild), screening (Greenblatt), análisis cualitativo (Fisher), análisis técnico (Murphy) y gestión del riesgo (Weinstein). Incluye lectura, navegación, tests con reintentos, progreso persistente y estados de carga/error. El contenido es original y usa ejemplos hipotéticos, con enlaces a lecturas complementarias; no reproduce los libros citados.

El Nivel 1 está disponible para cuentas Free. Los niveles 2–5 requieren Pro tanto en la interfaz como en PostgreSQL. Las tarjetas bloqueadas utilizan un índice editorial público incluido en la aplicación; la teoría, las preguntas y los registros de esos niveles no se entregan a cuentas Free. El CTA Pro reutiliza `pro_upgrade_requests`: registra una solicitud, sin cobro ni activación automática del plan.

Las migraciones de la academia son `20261015141442_academy_curriculum_and_progress.sql` y `20261015143626_academy_reference_links.sql`. Conservan los IDs de los niveles y la tabla existente `academy_lessons`, exponiéndola mediante la vista `lessons` con `security_invoker`. Añaden `quizzes`, las claves de corrección en `academy_private.quiz_answers` y las RPC autenticadas de evaluación y finalización. No necesitan nuevas Edge Functions.

- `getAcademyLevels()` obtiene el catálogo y los resúmenes de lecciones bajo RLS; el contenido se descarga al abrir una lección.
- `getUserProgress()` consulta únicamente el progreso del usuario autenticado.
- `submit_academy_quiz` corrige las respuestas en el servidor y conserva la mejor nota. El aprobado requiere al menos 70 %; con los tres ítems iniciales, dos aciertos equivalen al 67 % y tres al 100 %.
- `completeLesson(lessonId, quizScore?)` llama a `complete_academy_lesson`. La nota opcional no se envía como autoridad al servidor: solo se completa si ya existe una evaluación aprobada. Ambas RPC comprueban identidad y plan, fijan `search_path` y no admiten un ID de usuario del cliente.
- El progreso completado se conserva al repetir un test o al bajar de Pro a Free. La bajada de plan vuelve a bloquear el contenido Pro. Las claves de corrección y las escrituras directas del progreso no están disponibles para el navegador.

Despliegue y verificación de la academia:

```sh
npx supabase db push
npx supabase gen types typescript --linked --schema public
npx supabase migration list
npx supabase db query --linked --file supabase/tests/academy_rls_audit.sql
npm run build
npm run lint
npm test
npm run test:academy
```

Guarda la salida de `gen types` en `src/types/database.types.ts` con UTF-8. La auditoría SQL comprueba el contenido remoto, RLS Free/Pro, aislamiento entre usuarios, protección de respuestas, evaluación, reintentos y bajada de plan; crea usuarios temporales dentro de una transacción que revierte al terminar. Playwright utiliza respuestas de Supabase simuladas para verificar lectura, navegación, tests, recuperación de fallos al guardar, persistencia, paywall, foco del modal y presentación móvil. `npm test` también valida el contrato de los quince contenidos y cuestionarios sembrados.

Verificado el 15 de octubre de 2026 en el proyecto vinculado `zgycwhxwpxbqtivgssml`: ambas migraciones aplicadas mediante `db push`, historial local/remoto coincidente, tipos regenerados y auditoría SQL aprobada. Pasaron las siete pruebas unitarias y las siete de navegador (cuatro de academia y tres de dashboard), además de TypeScript y ESLint. Vite mantiene un aviso de tamaño del bundle principal superior a 500 kB; no impide compilar.

La revisión `db advisors --linked --type security` identifica las dos RPC nuevas como `SECURITY DEFINER` ejecutables por usuarios autenticados. Ese acceso es intencional: las funciones comprueban `auth.uid()`, el plan y la nota, y la auditoría prueba sus rechazos. También permanecen dos avisos preexistentes por permisos de `public.rls_auto_enable()` para `anon` y `authenticated`, ajenos a esta fase. No se presenta esta revisión como una auditoría de seguridad sin avisos.
