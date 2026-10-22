# Diagnóstico de Checkout y Portal — 2026-10-21

## Cambios

- `stripeService.ts` registra la función, el mensaje original, HTTP status, JSON/texto de respuesta y referencia de petición antes de mostrar la alerta. Conserva la causa original y limita la invocación a 20 segundos.
- Las suscripciones canceladas/expiradas pueden iniciar Checkout aunque el rol Pro esté pendiente de actualizar. Las suscripciones existentes, incluidas las pendientes de pago, abren el portal. Si Checkout devuelve `SUBSCRIPTION_EXISTS`, se intenta el portal una sola vez.
- Los fallos del portal permiten reintentar y contactar con soporte; no crean otra suscripción automáticamente. Los botones salen del estado de carga incluso ante rechazos de red.
- `VITE_STRIPE_PUBLISHABLE_KEY` se valida al iniciar el flujo: debe tener formato `pk_test_*` o `pk_live_*`. No se imprime su valor. Si falta/es inválida se avisa en consola, pero la redirección al Checkout/Portal alojado sigue disponible, pues usa la URL devuelta por el servidor y no Stripe.js. Configurar esta variable en Vercel requiere recompilar el frontend.
- Ambas Edge Functions validan `STRIPE_SECRET_KEY` y `STRIPE_PRICE_ID` antes de acceder a Supabase/Stripe. Una variable ausente, vacía o en blanco devuelve HTTP 500 con `error`, `message`, `code` y `request_id`. OPTIONS se atiende antes de esta validación con HTTP 204.
- El catch global devuelve HTTP 500 para excepciones inesperadas o de Stripe, con el mensaje original depurado en `error` y `message` y cabeceras CORS para orígenes permitidos. Se mantienen los 4xx explícitos de autenticación, método, origen y conflictos. Claves y correos se ocultan tanto en la respuesta como en los logs. El servidor registra además código/parámetro/request ID de Stripe sin volcar objetos completos ni cabeceras.

## Verificaciones

- `npm run build` y `npm run lint`: correctos. Persiste el aviso de Vite por el tamaño del bundle principal.
- `npm run test:subscription`: 17 pruebas de navegador correctas con Supabase/Stripe simulados.
- `npm run test:billing`: 8 pruebas correctas, incluyendo variables ausentes/vacías, preflight sin secretos, excepciones, CORS, autenticación, firmas y diagnóstico con ocultación de claves.
- `deno check`: correcto para Checkout y Portal. `deno lint --rules-exclude=no-import-prefix`: correcto; el repositorio utiliza imports `npm:` con versiones explícitas.
- Despliegue ejecutado: `npx supabase functions deploy create-checkout-session create-portal-session --project-ref zgycwhxwpxbqtivgssml --use-api`.
- Versiones activas verificadas tras el último despliegue: Checkout 16 y Portal 12. Ambas validan el JWT mediante `auth.getUser` dentro del handler.
- Pruebas reales contra ambos endpoints desde los orígenes `https://bull-vest.vercel.app` y `http://localhost:5173`: OPTIONS 204 con CORS actualizado; POST sin sesión devuelve 401 y un `request_id` coincidente entre cuerpo y cabecera.

## Alcance y diagnóstico pendiente

Los nombres `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` y `APP_ALLOWED_ORIGINS` existen en Supabase Secrets; no se han leído ni validado sus valores. La clave pública de Stripe no estaba definida en los archivos locales de entorno inspeccionados. La presencia de secretos no demuestra que el precio o el portal estén configurados correctamente en Stripe.

Tras desplegar la validación temprana, los POST sin sesión a ambas funciones desde el origen de producción devolvieron 401 con `error: UNAUTHORIZED`, CORS y referencia correlacionada. Esto confirma que las dos variables requeridas no están vacías en el runtime desplegado; no demuestra que Stripe acepte sus valores. Los errores 500 de configuración se comprobaron en pruebas locales, sin modificar los secretos de producción. Un 502 generado por la infraestructura antes de ejecutar el handler requiere revisar los logs de arranque; cambiar el catch no puede interceptarlo.

No se pudo consultar el historial de logs mediante el conector por falta de permisos. No se ha reproducido el fallo original con una sesión real ni completado un pago. El cambio del frontend está en el workspace y debe publicarse en Vercel para mostrar los nuevos diagnósticos en producción; las funciones de Supabase sí están desplegadas.

Tras publicar, un fallo registra `[Stripe] Edge Function falló` en DevTools. Su `requestId` permite localizar `billing_request_failed` en los logs de la función correspondiente. Si Stripe devuelve un error de configuración, comprobar allí su `stripe_code`, `stripe_param` y `stripe_request_id`; comprobar el precio recurrente `STRIPE_PRICE_ID` y la activación del Customer Portal en el mismo modo test/live que la clave secreta.

Referencias: [errores de Edge Functions](https://supabase.com/docs/guides/functions/error-handling), [creación de Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create).

## Conflicto con Managed Payments — 2026-10-22

La prueba autenticada de «Pasar a Pro» devolvió `STRIPE_REQUEST_FAILED`, referencia `123932ad-2120-4664-94c9-a9dadddc86fa`: Stripe rechaza `allowed_payment_method_types` cuando Managed Payments está habilitado por defecto en la cuenta. El parámetro es válido; el conflicto es con esa modalidad. El HTTP observado por el usuario no quedó determinado (400 o 500); el handler actual convierte las excepciones de Stripe en HTTP 500.

La primera corrección enviaba `managed_payments: { enabled: false }`, manteniendo `allowed_payment_method_types: ['card']`. Optaba por Checkout estándar para la sesión y la suscripción resultante sin modificar el valor global de la cuenta. Esta solución queda sustituida por la selección dinámica descrita al final del documento. Se conserva la clave de idempotencia y la reutilización de sesiones abiertas.

La prueba de regresión ejecuta el handler real con Supabase y el transporte de Stripe simulados. La versión inicial reproducía el rechazo y comprobaba el filtro de tarjeta; la actual comprueba la selección dinámica, cliente, precio, idempotencia, CORS y la respuesta HTTP 400 ante opciones rechazadas. No equivale a una operación real en Stripe.

Pendiente de despliegue y validación autenticada. Desplegar únicamente Checkout con acceso administrativo autorizado:

```sh
npx supabase functions deploy create-checkout-session --project-ref zgycwhxwpxbqtivgssml --use-api
```

Después, repetir «Pasar a Pro» y comprobar que la función devuelve una URL de Checkout. Si aparece un nuevo error, conservar su JSON y `request_id`; no rotar claves de idempotencia ni crear suscripciones alternativas para eludirlo.

## Portal para perfiles sin cliente — 2026-10-22

`create-portal-session` consulta el perfil del usuario validado por Supabase Auth. Si es Free y no tiene `stripe_customer_id`, devuelve HTTP 200 con `{ "action": "checkout_required" }` sin crear recursos en Stripe. Si es Pro, crea el cliente con el correo de Auth y `metadata.user_id`, usando una clave de idempotencia por usuario. Guarda el ID únicamente mientras la columna siga siendo NULL y vuelve a leer el perfil para utilizar el cliente persistido si otra petición ganó la carrera. Un fallo de escritura o lectura impide abrir el portal.

Cuando el cliente ya existe, se utiliza directamente para crear la sesión del portal con retorno al dashboard del origen permitido. El `try/catch` compartido de `billingHandler` conserva las respuestas JSON depuradas, CORS y `request_id`; los errores de Stripe o persistencia devuelven 500 y se mantienen los errores explícitos de autenticación y validación.

El frontend inicia Checkout para perfiles Free, incluso si conservan información de una suscripción anterior. Si Checkout confirma `SUBSCRIPTION_EXISTS`, abre el portal una sola vez. Una respuesta satisfactoria del portal con `checkout_required` inicia Checkout; un error del portal sigue mostrándose sin iniciar una compra. Cada acción permite como máximo un cambio de destino: respuestas contradictorias muestran un error recuperable y nunca generan un bucle Checkout/Portal.

Validación local: 10 pruebas de facturación correctas (incluidos nueve escenarios del portal), 20 pruebas de navegador de suscripciones correctas con API simulada, build, ESLint, Deno check y Deno lint correctos. Persiste el aviso de tamaño del bundle de Vite.

Estos cambios requieren publicar el frontend y desplegar `create-portal-session`. La apertura real del portal con una sesión autenticada sigue pendiente de verificación.

## Checkout con selección dinámica de métodos

La creación de sesiones omite `allowed_payment_method_types`, `payment_method_types` y `managed_payments`, utilizando los métodos habilitados y elegibles según la configuración de Stripe. No se envía `automatic_payment_methods`: es una opción de Payment Intents, no de `checkout.sessions.create`. La [guía oficial de métodos dinámicos](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods) indica que Checkout debe omitir la lista de métodos, mientras que las integraciones con Payment Intents pueden utilizar `automatic_payment_methods`. La [referencia de creación de Checkout](https://docs.stripe.com/api/checkout/sessions/create) y el SDK Stripe 23.0.0 instalado no admiten esa propiedad.

Un `try/catch` alrededor de `stripe.checkout.sessions.create` convierte `StripeInvalidRequestError` en HTTP 400 con `code: STRIPE_REQUEST_FAILED`, `error`, `message` y `request_id`. El handler común depura el mensaje, añade CORS y conserva los diagnósticos originales de Stripe mediante la causa del error. Los errores inesperados siguen devolviendo HTTP 500.

Validación local: las 10 pruebas de facturación (incluidos nueve casos del portal), Deno check y Deno lint pasan. La prueba de Checkout verifica que no se envían los parámetros incompatibles, que se conserva la idempotencia y que un rechazo de opciones produce JSON 400 sin revelar claves.

Desplegada únicamente `create-checkout-session`, versión 18 ACTIVE, con `verify_jwt = false` y validación interna de Auth. Portal permanece en versión 13 y las demás funciones conservan sus versiones anteriores. Comprobaciones remotas desde el origen de producción: OPTIONS 204 y POST sin sesión 401 con JSON, CORS y `request_id`. Sigue pendiente la creación de una sesión de Checkout con un usuario autenticado; las comprobaciones anónimas no validan la aceptación de los parámetros por Stripe.
