# Auditoría y corrección de pagos — 27 de octubre de 2026

## Causa confirmada

El frontend publicado en Vercel correspondía a `31f8f97`, pero el Checkout de Supabase era una versión distinta del código del repositorio. La descarga de la función activa **versión 19** mostró:

```ts
automatic_payment_methods: { enabled: true }
// Clave en la versión desplegada:
idempotencyKey: `bullvest-checkout-${requestId}-${Date.now()}`
```

El SDK Stripe 23.0.0 y la API de Checkout no aceptan `automatic_payment_methods` en la creación de una sesión. La eliminación ya existía en Git, pero no en la función que ejecutaba producción. El catch remoto convertía el rechazo de Stripe en HTTP 500. Publicar solo el frontend en Vercel no actualiza las Edge Functions.

## Flujo auditado y cambios

La acción «Pasar a Pro» invoca una Edge Function autenticada; esta resuelve el cliente, comprueba suscripciones/sesiones, reserva el intento en PostgreSQL y crea Checkout. El navegador sigue la URL alojada. El webhook firmado aplica la suscripción y el frontend refresca el perfil al retornar.

### Checkout y módulo compartido

- El cuerpo enviado contiene únicamente `mode`, `customer`, `client_reference_id`, `line_items`, `success_url`, `cancel_url`, `metadata` y `subscription_data.metadata`.
- No se envían `automatic_payment_methods`, `allowed_payment_method_types`, `payment_method_types`, `managed_payments` ni otros filtros/configuraciones de métodos de pago. La cuenta conserva su configuración del Dashboard.
- La prueba de regresión intercepta el transporte real del SDK y verifica los campos serializados hacia Stripe, no solo el objeto TypeScript.
- Se conservan autenticación con `auth.getUser`, precios elegidos por el servidor, comprobación de suscripción existente, reutilización de sesiones abiertas y validación de origen/retornos.
- Los rechazos `StripeInvalidRequestError` se traducen uniformemente a HTTP 400; los conflictos `StripeIdempotencyError`, a HTTP 409. Las excepciones inesperadas mantienen HTTP 500. La respuesta conserva `code`, mensaje depurado, `request_id` y CORS.

### Idempotencia

La clave pasa a ser `bullvest-checkout-v2-<UUID del intento>-<SHA-256 de parámetros>`. El UUID aleatorio ya lo genera y persiste `reserve_stripe_checkout` en PostgreSQL. Se contrastó la definición remota: serializa por perfil y mantiene la reserva durante 23 horas.

Un intento nuevo obtiene otra clave; un cambio del cuerpo obtiene otra huella; las peticiones simultáneas y los reintentos del mismo intento/cuerpo conservan la misma clave. El prefijo nuevo evita reutilizar claves de las implementaciones anteriores. No se añade un UUID aleatorio en cada reintento HTTP, porque eso permitiría crear sesiones distintas ante dobles clics o respuestas perdidas. Esta distinción conserva la protección de duplicados y evita colisiones por cambios de parámetros. Las claves no contienen correos ni parámetros de cliente en claro.

### Customer Portal

La llamada a Stripe envía solo `customer` y `return_url`. Ya no depende de `STRIPE_PRICE_ID`, que no necesita para gestionar una suscripción existente.

- Free sin cliente ni suscripción: devuelve `checkout_required`; el frontend abre Checkout una sola vez.
- Cliente vinculado: abre el portal usando el ID del perfil autenticado, aunque el perfil sea Free por impago.
- Pro/Admin sin cliente, o una suscripción guardada sin cliente: devuelve HTTP 409 `CUSTOMER_NOT_FOUND` y orientación para recuperar el vínculo. No crea un cliente vacío ni inicia otra venta automáticamente. Crear otro Customer no recuperaría las suscripciones del cliente original.

### Frontend React/Vite

Se revisaron `stripeService`, `SubscriptionActions`, los paywalls y `CheckoutSuccessPage`:

- Los errores de Stripe mantienen detalle, HTTP y referencia; se añade recuperación de la referencia desde `X-Request-Id` cuando el cuerpo no la incluye.
- Los botones liberan el estado de carga y permiten reintentar; la protección de dobles clics ya existía.
- Checkout y Portal solo se alternan una vez ante los estados explícitos previstos; una respuesta contradictoria no provoca un bucle.
- La redirección exige HTTPS y los dominios alojados de Stripe previstos.
- El éxito depende del perfil confirmado por backend, no del `session_id` recibido en la URL.
- `@stripe/stripe-js` está instalado, pero el flujo de redirección alojado no necesita una clave pública para crear la sesión. La ausencia local de `VITE_STRIPE_PUBLISHABLE_KEY` produce un aviso, no este fallo.

### Webhook, RPC y secretos

El cuerpo del webhook descargado coincidía con el repositorio. Valida la firma sobre el cuerpo original, consulta el estado actual de Stripe y llama a `apply_stripe_subscription`, que deduplica eventos y ordena las sincronizaciones. Se comprobó en la nube que esta RPC preserva Admin y que ni `anon` ni `authenticated` pueden ejecutarla; lo mismo aplica a `reserve_stripe_checkout`. No se modifica el esquema en esta corrección.

Los nombres `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` y `APP_ALLOWED_ORIGINS` existen en Supabase. No se extrajeron valores secretos. No hay `STRIPE_ANNUAL_PRICE_ID` entre los secretos comprobados: el plan anual sigue requiriendo configuración adicional si se quiere habilitar. Los secretos privados deben permanecer en Supabase, nunca en variables `VITE_*`.

### Vercel

Se verificó el proyecto `bull-vest`, equipo `team_w3b2uJOfRtVJItUkYqgY9vqq`, producción en `bull-vest.vercel.app`, conectado a `Cuet1so/BullVest`, rama `main`, con Node 24. `vercel.json` ya contiene el fallback SPA. Las rutas `/`, `/login`, `/dashboard` y `/checkout/success` respondieron HTTP 200 con la aplicación antes del cambio. El service worker no almacena solicitudes de pagos ni datos privados en caché.

## Verificación

- Build de producción y ESLint correctos. Persiste una advertencia de tamaño del chunk principal, ajena al rechazo de Stripe.
- Deno: 11 pruebas de facturación, incluidos siete escenarios de Portal, correctas. Chequeo de tipos de las tres funciones y lint del código modificado correctos.
- Navegador: 23 casos de suscripción verificados; 22 pasaron en la primera ejecución. El nuevo caso de referencia por cabecera requirió que el mock expusiera `X-Request-Id` mediante CORS, igual que el servidor real; pasó al repetirlo por separado tras corregir el fixture.
- Los servicios de Stripe/Supabase se simulan en estas pruebas. No acreditan un cobro real ni que el producto/precio esté habilitado correctamente para Managed Payments.

## Despliegue y límites

Despliegue ejecutado en el proyecto `zgycwhxwpxbqtivgssml`:

```sh
npx supabase functions deploy create-checkout-session --project-ref zgycwhxwpxbqtivgssml --use-api
npx supabase functions deploy create-portal-session stripe-webhook --project-ref zgycwhxwpxbqtivgssml --use-api
```

Versiones activas verificadas: Checkout **20**, Portal **14**, webhook **10**. Se descargaron de nuevo los tres entrypoints y el módulo compartido: coinciden con el parche local. Desde localhost y el dominio de producción, ambas funciones devuelven OPTIONS 204 y POST sin sesión 401, con CORS y referencias correlacionadas. El webhook sin firma devuelve 400. Estas comprobaciones no crean clientes, sesiones ni pagos.

El frontend se entrega mediante el commit y push solicitado a `origin main`; el estado final del despliegue de Vercel se comunica tras la publicación.

Quedan como comprobaciones operativas con una sesión real: abrir Checkout, confirmar un pago en Test Mode, recibir el webhook y gestionar/cancelar desde Portal. No se usaron credenciales de usuarios ni se iniciaron cobros durante la auditoría. La configuración comercial de Managed Payments y la elegibilidad fiscal del producto se administran en Stripe y no quedan demostradas por la presencia de secretos.

Deuda detectada fuera del parche: el webhook solo reconoce precios actualmente configurados (conservar los históricos al migrar precios); no hay reconciliación periódica de suscripciones; las reservas pueden impedir cambiar de plan/origen hasta que expire el intento; la pantalla de éxito solo trata `role === 'pro'`, aunque la RPC preserve Admin. No se alteran estas reglas como parte de la reparación del parámetro inválido.

## Fuentes oficiales

- [Creación de sesiones Checkout](https://docs.stripe.com/api/checkout/sessions/create).
- [Idempotencia de Stripe](https://docs.stripe.com/api/idempotent_requests): mantener la clave al reintentar la misma operación y no reutilizarla con parámetros distintos.
- [Migración a Managed Payments](https://docs.stripe.com/payments/managed-payments/update-checkout): restricciones de métodos y configuración de cuenta/producto. La API admite opciones de Managed Payments en otros escenarios; aquí se omiten por la configuración solicitada para BullVest.
- [Despliegue de Edge Functions](https://supabase.com/docs/guides/functions/deploy).
