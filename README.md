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

## Simulador: catálogo extendido y filtros de mercado

El simulador consume el catálogo existente de `public.assets`, incluyendo categorías, bid/ask, variaciones, volatilidad, popularidad, memes, opciones y señales. La consulta pagina por ticker/ID para leer más allá del límite de filas de una respuesta. Los tipos se generan desde el proyecto Supabase vinculado.

`MarketFilters.tsx` ofrece las catorce pestañas especificadas: Populares, Acciones, Criptodivisas, Monedas Meme, Productos / Materias Primas, Índices, Monedas / Forex, Opciones, Sin Comisiones, Señales y los cinco rankings por variación/volatilidad. Incluye desplazamiento horizontal y navegación de teclado con flechas, Inicio y Fin. Los porcentajes almacenados se interpretan en puntos porcentuales: `2.3` se muestra como `+2,30 %`. Los datos nulos se muestran como `—` y quedan al final de los rankings; las tendencias de 30 días excluyen los valores nulos y cero.

La búsqueda por ticker o nombre recorre **todo el catálogo**, independientemente de la pestaña seleccionada. Al borrarla se recupera la pestaña anterior; seleccionar otra pestaña limpia la búsqueda. `MarketTable.tsx` muestra iconos, categorías, señales, ambos precios y variación de 24 h; los rankings de 30 días o volatilidad añaden su métrica. Las acciones de cada fila preparan la compra o venta y llevan el foco a la cantidad. La operación se envía únicamente tras confirmarla en `OrderForm`.

La migración `20261015175153_market_bid_ask_quotes.sql` registra las columnas remotas existentes sin reemplazar datos, amplía `sell_price` a `numeric(20,8)` y actualiza las funciones de refresco y ejecución. El refresco aplica el mismo factor a compra y venta para conservar el spread relativo. Las variaciones de 24 h/30 d y la volatilidad son las métricas almacenadas del catálogo; no se recalculan a partir de fluctuaciones sintéticas. Los precios previos que ya se hubieran redondeado a cero no pueden reconstruirse con la ampliación de precisión.

`trading` toma el precio de compra o venta desde Supabase según el lado de la orden; PostgreSQL vuelve a validarlo bajo bloqueo. Total, saldo, precio ejecutado y P/L realizado usan ese mismo precio. Se mantienen idempotencia, RLS, límite de frescura y restricciones de saldo/unidades. Un bid nulo, no positivo o superior al ask no permite vender; no se sustituye silenciosamente por `current_price`. El patrimonio y P/L latente siguen valorándose al `current_price`, como en el dashboard, y no equivalen al importe neto de liquidación con spread.

El 15 de octubre de 2026 se verificaron 34 activos remotos, de los cuales 3 tenían `is_tradable = true`. Los otros 31 se muestran como «Solo consulta» y sus botones permanecen deshabilitados, respetando el catálogo. La pestaña de opciones filtra `has_options`; no incorpora contratos de opciones ni cambia el motor de operaciones. La referencia visual pública de Libertex respondió con una verificación de Cloudflare, por lo que se reprodujeron los filtros y la estructura solicitada, sin verificar identidad visual píxel a píxel.

Despliegue ejecutado: `npx supabase db push` y `npx supabase functions deploy trading`, conservando la verificación JWT. `refresh-quotes` reutiliza la RPC actualizada y no requiere redespliegue. Las pruebas están en:

- `npm test`: los catorce filtros/rankings, búsqueda global, nulos, señales, precisión, selección de bid/ask y cotizaciones inválidas.
- `npm run test:trading`: cinco pruebas Playwright con API simulada, acciones de fila, reintento de una orden con resultado incierto, móvil/teclado, paginación de 505 instrumentos y errores de refresco.
- `npx supabase db query --linked --file supabase/tests/market_quotes_audit.sql`: auditoría SQL real con rollback de saldos, posiciones, P/L, cotizaciones, reintentos, refresco, precisión y permisos.
- `npm run build`, `npm run lint` y `deno check --config supabase/functions/trading/deno.json supabase/functions/trading/index.ts`: comprobación del frontend y la Edge Function.

Verificación final del cambio: 11 pruebas unitarias y 18 de navegador aprobadas, build/ESLint/Deno correctos y ambas auditorías SQL de cotizaciones aprobadas tras el despliegue. El historial de migraciones local/remoto coincide. Vite conserva el aviso de bundle superior a 500 kB. Los asesores de Supabase no señalan `execute_trade` ni `refresh_asset_prices`; sí mantienen avisos sobre funciones ajenas al cambio (`rls_auto_enable`, academia y recargas) y la protección de contraseñas filtradas desactivada.

## Fase 8: ranking, social trading, rendimiento y PWA

`/ranking` incorpora paginación de 20 inversores, periodos de 7 días, 30 días e histórico, medallas para el Top 3 y seguimiento persistente. El filtro de seguidos conserva la posición global. Seguir a un inversor permite consultar sus resultados públicos; no copia órdenes. Las cinco insignias se calculan desde las operaciones y el progreso aprobado: primera operación, diez operaciones, primera venta ganadora, primera lección y las quince lecciones completadas.

El Dashboard incluye Win Rate, Max Drawdown, Ratio Sharpe y una curva diaria de patrimonio con Recharts. Las métricas proceden de observaciones reales del simulador, con estas convenciones:

- Patrimonio = saldo líquido + unidades de cada posición × `assets.current_price`, igual que la valoración del Dashboard. No representa el importe neto de liquidación al bid.
- El ROI del ranking usa Modified Dietz: `(valor final − valor inicial − flujos netos) / (valor inicial + flujos ponderados por tiempo)`. Las recargas, incluidas las que reducen el saldo, se registran como flujos externos. Se toma la primera observación disponible dentro del periodo y se muestra su fecha. Referencia metodológica: [GIPS Standards Handbook](https://www.gipsstandards.org/wp-content/uploads/2021/04/gips-standards-handbook-firms.pdf).
- Win Rate = ventas con P/L realizado positivo / ventas con P/L conocido en el periodo. Cada ejecución SELL, incluida una venta parcial, cuenta una vez. Sin ventas se muestra `—`.
- Drawdown = máxima caída del índice de rendimientos encadenados, ajustados por flujos con Modified Dietz. Usa los puntos disponibles y la valoración actual; no mide mínimos intradiarios que no se hayan conservado. Un intervalo sin denominador válido deja el drawdown en `—`.
- Sharpe = media / desviación estándar muestral de retornos diarios × √365, con tasa libre de riesgo asumida 0. Solo usa cierres de días UTC consecutivos con cotizaciones vigentes en ambos extremos; excluye el día en curso, intervalos incompletos y precios caducados. Requiere al menos dos retornos y varianza distinta de cero; en otro caso muestra `—`.
- La curva muestra patrimonio bruto, incluidas recargas. No se inventa historia previa al despliegue. Hay un punto inicial y una última observación por día UTC, capturada tras operaciones, recargas y cambios de precios, además de un cron cada cinco minutos. El cron registra los últimos precios disponibles; no crea un proveedor de cotizaciones.

La campana de navegación permite crear alertas por encima o por debajo de un precio de compra, consultar las activadas, marcarlas como leídas y eliminarlas. PostgreSQL evalúa la condición al crear la alerta y al actualizar precios vigentes (120 segundos), aunque su propietario haya cerrado la aplicación. Cada alerta se activa una sola vez. Hay un máximo de 100 alertas guardadas por usuario; la interfaz consulta novedades cada 30 segundos mientras está visible. Este centro es interno a BullVest y no envía notificaciones push ni correos externos.

### Esquema, permisos y despliegue de la fase 8

Migraciones aplicadas:

- `supabase/migrations/20261015185328_phase8_ranking_analytics_alerts.sql`: tablas `performance_baselines`, `equity_snapshots`, `portfolio_cash_flows`, `trader_follows`, `price_alerts`, RPC autenticadas, triggers, RLS y cron.
- `supabase/migrations/20261015191238_phase8_alert_ownership_guard.sql`: rechazo de suplantación antes de consultar el cupo de alertas y restricción de precio activado obligatorio.

Las tablas privadas solo admiten lectura del propietario. Las valoraciones y flujos no admiten escrituras del navegador. Las alertas permiten insertar campos de la condición, borrar las propias y actualizar únicamente `read_at` cuando se han activado. El esquema `analytics_private` no está expuesto a clientes. Las RPC fijan `search_path`, verifican `auth.uid()` y limitan los resultados; el ranking publica un nombre, identificador, métricas e insignias, sin exponer emails, vidas, datos de facturación, posiciones ni transacciones ajenas.

Se ejecutaron `npx supabase db push`, `npx supabase gen types typescript --linked --schema public`, `npx supabase migration list` y `npx supabase db advisors --linked --type security` en `zgycwhxwpxbqtivgssml`. Los diez registros del historial local y remoto coinciden y los tipos de `src/types/database.types.ts` se regeneraron desde la nube. No se crearon ni modificaron Edge Functions en esta fase; la evaluación de alertas y captura de patrimonio se realizan en PostgreSQL.

Auditoría real del 15 de octubre de 2026: dos perfiles con baseline y snapshot; cron activo con ejecuciones `succeeded` a las 19:10 y 19:15 UTC. `supabase/tests/phase8_audit.sql` verifica ROI sin ganancia ficticia por recarga, ventanas temporales, paginación, win rate, insignias, seguimiento, alertas, aislamiento RLS y rechazo anónimo. Sus usuarios y modificaciones se revierten dentro de una transacción. Los asesores señalan las cuatro RPC de lectura `SECURITY DEFINER` autenticadas como avisos esperados por diseño; su alcance está probado. Permanecen los avisos anteriores sobre `rls_auto_enable`, academia, recargas y protección de contraseñas filtradas desactivada.

### Instalación y modo sin conexión

La PWA utiliza `public/manifest.webmanifest`, iconos PNG y `public/sw.js`. El service worker solo se registra en producción. Al quedarse sin conexión, una navegación muestra `offline.html`; la aplicación abierta indica que los datos pueden estar desactualizados. La caché contiene exclusivamente esa pantalla y dos iconos públicos. Los datos de cuenta, peticiones de Supabase y órdenes no se almacenan en Cache Storage ni se encolan para enviarse después. Se conserva el almacenamiento de sesión existente de Supabase Auth.

Para publicarla, servir `dist/` mediante HTTPS con fallback de las rutas SPA a `index.html`, respetando los archivos estáticos reales. Servir `/sw.js` con revalidación (`Cache-Control: no-cache`) y el manifest con tipo `application/manifest+json`. El botón de instalación aparece cuando el navegador emite `beforeinstallprompt`; en navegadores sin ese evento se utiliza su menú de instalación o «Añadir a pantalla de inicio». La prueba local usa localhost, que admite service workers. Este cambio no despliega el hosting del frontend.

`index.html` incluye metadatos Open Graph, tarjeta social e imagen de 1200×630. Configurar `VITE_PUBLIC_SITE_URL` con el origen real del frontend antes de compilar para generar las URL sociales absolutas. No se supone un dominio de producción. Los iconos e imagen social se pueden reproducir con `npm run assets:pwa` a partir de los vectores originales de BullVest.

Verificación de la fase 8:

```sh
npm run build
npm run lint
npm test
npm run test:browser -- --workers=3
npm run test:pwa
npx supabase db query --linked --file supabase/tests/phase8_audit.sql
```

Resultado: build sin errores TypeScript, ESLint sin errores ni avisos, 15 pruebas unitarias, 22 pruebas de navegador y una prueba de PWA sobre el build de producción aprobadas. Las pruebas de navegador simulan Supabase; la auditoría SQL usa la base de datos real con rollback. La prueba PWA verifica manifest, dimensiones de iconos, metadatos, service worker activo, navegación offline y ausencia de datos privados en la caché. Vite conserva el aviso de bundle principal superior a 500 kB.
