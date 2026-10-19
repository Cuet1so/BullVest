# Auditoría técnica de BullVest

Fecha: 19 de octubre de 2026.

## Alcance y conclusión

Se revisaron el árbol del repositorio, `src/`, `supabase/`, `public/`, las configuraciones, los servicios y las pruebas. Se contrastaron mediante consultas de solo lectura las migraciones, el esquema, los permisos y la configuración accesible del proyecto Supabase vinculado. También se comprobaron respuestas HTTP del despliegue público.

BullVest tiene implementados los flujos principales del simulador, academia y suscripciones. **No está todavía validado como un producto operativo de extremo a extremo en producción**: las rutas profundas de Vercel devuelven 404, faltan los secretos de Stripe, Google está deshabilitado y existen diferencias entre la base remota y el repositorio. Los tests satisfactorios no eliminan estos bloqueos.

Esta auditoría no modifica funcionalidades ni datos remotos, no ejecuta pagos y no constituye una prueba de penetración. Los resultados de configuración y HTTP son una fotografía de la fecha indicada.

## 1. RESUMEN DE ARQUITECTURA Y TECH STACK

### Arquitectura

SPA en React con `BrowserRouter`, organizada por funcionalidades. El navegador consulta Supabase mediante un cliente tipado; las operaciones sensibles pasan por Edge Functions y/o RPC de PostgreSQL. Stripe comunica cambios de suscripción al backend mediante un webhook. No hay un servidor propio de renderizado ni SSR.

```text
src/
  components/layout/        Layout y protección de rutas
  features/auth/            Sesión, perfiles y formularios
  features/dashboard/       Patrimonio, cartera y operaciones recientes
  features/trading/         Mercado, órdenes y recargas
  features/academy/         Lecciones, cuestionarios y progreso
  features/subscription/    Checkout, portal y paywalls
  lib/                      Cliente Supabase
  types/                    Tipos de base de datos
supabase/
  functions/                Trading, cotizaciones y tres funciones de Stripe
  migrations/               Ocho migraciones locales
  tests/                    Cinco auditorías SQL
  sql/                      Script histórico de saldo
public/                     Iconos, robots y sitemap
tests/                      Pruebas unitarias y de navegador
docs/                       Documentación
```

| Área | Implementación observada |
| --- | --- |
| UI | React y React DOM 19.2.8; TypeScript ~6.0.2 |
| Build | Vite ^8.3.0; compilación ejecutada con Vite 8.3.4 |
| Navegación | React Router DOM ^7.18.4 |
| Estilos | Tailwind CSS ^4.3.3 mediante `@tailwindcss/vite`; CSS global |
| Visualización | Recharts ^3.10.1, Lucide React ^1.57.0 |
| Estado | `AuthContext` global y hooks locales por funcionalidad; sin Redux/Zustand ni caché de consultas compartida |
| Backend | Supabase Auth, PostgreSQL, RLS, RPC, Realtime y Edge Functions Deno |
| Clientes | `@supabase/supabase-js` ^2.117.3; Stripe backend fijado a 23.0.0 |
| Pagos frontend | `@stripe/stripe-js` ^10.1.0 instalado; el flujo actual redirige a la URL de Checkout alojado, sin necesitar ese SDK |
| Validación | ESLint, Node test runner, Playwright y tests Deno |
| Hosting | Vercel; no existe `vercel.json` en el repositorio |

Los rangos anteriores proceden de `package.json`, salvo donde se indica una versión ejecutada o fijada en backend. `.nvmrc` prescribe Node 24. El Node 18 predeterminado del entorno no era adecuado para el toolchain; se usó Node 24.21.0 para las comprobaciones.

### Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| `npm run build` | Correcta; TypeScript sin errores; advertencia de tamaño de bundle |
| `npm run lint` | Correcta |
| `npm test` | 11/11 pruebas correctas |
| `npm run test:billing` | 3/3 pruebas correctas |
| `npx playwright test --workers=2` | 18/18 pruebas correctas |
| Supabase: historial, esquema, permisos, nombres de secretos y advisors | Consultados en modo lectura |
| Despliegue público y configuración pública de Auth | Comprobados por HTTP |

Las pruebas de navegador simulan servicios externos y las de facturación no realizan un cobro real. Los cinco scripts SQL fueron inspeccionados, pero no se ejecutaron en esta auditoría. No se realizó un análisis de vulnerabilidades de dependencias ni se inspeccionaron todos los cuerpos de las RPC adicionales exclusivas de la nube.

## 2. INVENTARIO DE FUNCIONALIDADES IMPLEMENTADAS

### Autenticación y usuarios

- Login y registro por correo/contraseña, nombre de usuario, confirmación de correo, logout y mensajes de error/carga.
- Google OAuth implementado en `AuthContext` y botón compartido en Login/Registro, con retorno a `/dashboard`. **El proveedor Google sigue deshabilitado en el proyecto remoto**, por lo que la presencia del botón no implica funcionamiento real.
- Sesión persistente, renovación automática y detección de sesión en URL mediante Supabase. El contexto carga el perfil, evita resultados obsoletos y lo refresca mediante Realtime y al recuperar foco.
- `ProtectedRoute` protege Dashboard, Simulador, Academia y Checkout Success; Login/Registro son rutas para invitados. No se detectó una pantalla privada principal expuesta por ausencia de este guard. La autorización de datos depende además de RLS/RPC.
- El retorno después del login se restringe a rutas internas. El inicio y las rutas desconocidas redirigen al Dashboard; no hay una página 404 propia.
- Free/Pro están conectados a permisos, vidas y paywalls. **Admin existe en la restricción de la base remota, pero no tiene implementación coherente en el frontend ni un panel administrativo**.
- El trigger remoto `on_auth_user_created` llama a `handle_new_user()`: crea un perfil Free con tres vidas y 10.000 de saldo; el nombre puede venir de metadatos. Estos metadatos no permiten elegir el rol o las vidas.
- No se encontró flujo de recuperación de contraseña, edición de cuenta ni MFA en la UI.

Evidencias: `src/features/auth/`, `src/components/layout/ProtectedRoute.tsx`, `src/App.tsx`, `src/lib/supabase.ts` y definición remota del trigger.

### Base de datos y backend Supabase

El esquema soporta perfiles, activos, posiciones, transacciones, academia, progreso, recargas y facturación. La consulta remota encontró 34 activos y 15 lecciones.

| Grupo | Objetos observados |
| --- | --- |
| Cuenta y trading | `profiles`, `assets`, `portfolios`, `transactions`, `life_reloads_log` |
| Academia | `academy_levels`, `academy_lessons`, `quizzes`, `user_academy_progress`; respuestas en `academy_private.quiz_answers` |
| Suscripción | IDs de Stripe en `profiles`, `private.stripe_events`, `private.stripe_checkout_attempts` |
| Objetos anteriores | `pro_upgrade_requests`, `public.subscriptions`, `public.stripe_events`; requieren aclarar su papel frente al flujo actual |
| Solo reflejados en la nube | `trader_follows`, `price_alerts`, `performance_baselines`, `equity_snapshots`, `portfolio_cash_flows` y RPC adicionales |

Se observó RLS activado en las 20 tablas de los esquemas revisados. Los perfiles y datos financieros personales tienen políticas de acceso propio. El usuario autenticado solo tiene permiso de actualización directa sobre `profiles.display_name`, no sobre rol, vidas o saldo. Las vistas revisadas usan `security_invoker`.

Las operaciones de trading pasan por una Edge Function autenticada y una RPC de servicio: el servidor obtiene el precio, bloquea filas relevantes, comprueba saldo/posición y registra la operación. El identificador de solicitud permite reintentos idempotentes.

`refill_portfolio_balance()` utiliza `auth.uid()` y bloqueo de perfil. Para Free descuenta una vida, rechaza cero vidas y fija el saldo en 10.000; para Pro no descuenta. Registra las recargas y conserva las posiciones existentes. La función auxiliar `use_life_reload` mantiene una inconsistencia para Admin, detallada más abajo.

La academia valida y puntúa mediante `submit_academy_quiz` y exige aprobación antes de completar una lección. Las claves de respuesta están separadas del esquema público. Los permisos inspeccionados de las funciones antiguas `record_lesson_result` y `apply_stripe_subscription_event` no permitían ejecución por `anon`/`authenticated`.

**Reproducibilidad pendiente:** las ocho migraciones locales están en el historial remoto, pero faltan localmente `20261015185328` y `20261015191238`. Tampoco existe una migración base que cree todas las tablas iniciales: la primera ya presupone `assets`. El SQL base mencionado por la documentación y el `seed.sql` referenciado en configuración no están presentes. No se puede considerar reproducible una instalación desde una base vacía con estos archivos.

### Simulador de trading

- Catorce filtros: populares, acciones, cripto, meme, materias primas, índices, forex, opciones, señales, ganadores, perdedores, volátiles, subida 30 días y caída 30 días.
- Búsqueda transversal del catálogo, normalización de texto, ordenación de métricas y tratamiento de valores ausentes.
- Cotizaciones ask para compra y bid para venta; validación de precios positivos, spread coherente, vigencia y disponibilidad del activo. Precisión de cantidades/precios para activos pequeños.
- Órdenes BUY/SELL con controles en cliente y servidor, coste medio ponderado, beneficio realizado e historial. No se permite vender una posición inexistente ni exceder sus unidades.
- Cartera y Dashboard conectados a Supabase: efectivo, patrimonio, P/L no realizado, distribución mediante Recharts y operaciones recientes.
- Recarga mediante RPC, contador de tres vidas, recargas ilimitadas Pro y modal de conversión cuando se agotan.
- Estados de carga/error/vacío, desactivación de operaciones con cotizaciones inválidas y navegación de pestañas mediante teclado.

**Límites funcionales:** las cotizaciones son simuladas, no un feed bursátil. `refresh-quotes` produce variaciones aleatorias globales y se dispara desde clientes, normalmente cada minuto. La pestaña de opciones es una clasificación basada en metadatos; no implementa contratos, vencimientos ni griegas. Las señales y rankings dependen de campos almacenados, no de un motor de análisis/histórico implementado aquí. El historial muestra hasta 50 operaciones, sin paginación de usuario.

Evidencias: `src/features/trading/`, `src/features/dashboard/`, `supabase/functions/trading/`, `supabase/functions/refresh-quotes/` y migraciones de cotizaciones.

### Academia EdTech

Cinco niveles implementados: estados financieros/John Wild, selección/Greenblatt, ventajas competitivas/Fisher, análisis técnico/Murphy y tendencias/riesgo/Weinstein. El contenido incluye 15 lecciones y 45 preguntas, referencias y enlaces.

Hay tarjetas de nivel, visor de lecciones bajo demanda, diálogos, cuestionarios, navegación y progreso persistido. El servidor corrige respuestas, conserva la mejor puntuación y requiere superar el umbral del 70 % para completar; con tres preguntas esto exige tres aciertos, pues dos aciertos dan 67 %.

Free accede al nivel 1; los niveles 2–5 requieren Pro tanto en UI como en políticas de datos. El catálogo estático de presentación de niveles bloqueados no sustituye los cuerpos reales de las lecciones. El paywall enlaza con Checkout. No hay CMS, emisión de certificados ni gestión editorial administrativa.

### Pagos y suscripciones Stripe

- `create-checkout-session`: autentica el usuario, crea/reutiliza cliente, usa precios del servidor y devuelve la URL de Checkout. Comprueba suscripciones existentes y reutiliza/reserva intentos para reducir duplicados concurrentes.
- `create-portal-session`: genera acceso al portal del cliente guardado, con retorno al Dashboard.
- `stripe-webhook`: valida la firma sobre el cuerpo original; procesa finalización de Checkout, cambios/baja de suscripción y eventos de facturas pagadas/fallidas. Consulta el estado actual de Stripe, registra eventos y aplica controles de duplicación/orden.
- Las actualizaciones de permisos se realizan con cliente de servicio. Las funciones autenticadas validan al usuario explícitamente; `verify_jwt = false` no significa por sí solo acceso sin autorización. El webhook usa la firma de Stripe.
- Orígenes permitidos y redirecciones controladas. Las comprobaciones CORS aceptaron tanto `http://localhost:5173` como `https://bull-vest.vercel.app`.
- `stripeService`, CTA de navegación/Dashboard/Academia, modal sin vidas y página de éxito conectados. La página de éxito refresca y consulta el perfil; no concede Pro por recibir un parámetro de URL. Dispone de estado pendiente y reintento.

**Bloqueo operativo confirmado:** no aparecen configurados `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ni `STRIPE_PRICE_ID` entre los secretos remotos. Deben ser valores de Test Mode para el alcance solicitado. El plan anual requiere adicionalmente `STRIPE_ANNUAL_PRICE_ID` y habilitar la opción frontend `VITE_STRIPE_ANNUAL_ENABLED`. `APP_ALLOWED_ORIGINS` sí está configurado. Quedan por validar en Stripe precio, endpoint/eventos de webhook y configuración del Customer Portal con pruebas reales.

### SEO, metadatos y despliegue

`index.html` contiene idioma español, título de marca solicitado, descripción, keywords, canonical, Open Graph básico, JSON-LD `WebApplication` y etiqueta de verificación de Google. La existencia de esta etiqueta no demuestra que Search Console haya completado la verificación.

`public/sitemap.xml` contiene la URL raíz, frecuencia semanal, prioridad 1.0 y fecha `2026-10-15`. `public/robots.txt` existe en el workspace con permiso de rastreo y referencia al sitemap, pero está **sin seguimiento de Git**.

| URL pública comprobada | Respuesta |
| --- | --- |
| `/` | 200; HTML con raíz de la app y verificación de Google |
| `/login` | 404 |
| `/dashboard` | 404 |
| `/checkout/success` | 404 |
| `/robots.txt` | 404 |
| `/sitemap.xml` | 200, XML |

No hay `vercel.json`. Los 404 confirman un problema real al entrar directamente o volver desde proveedores externos, aunque la navegación interna de la SPA pueda funcionar. Configurar el fallback de rutas siguiendo la [documentación oficial de Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite), preservando la entrega de archivos estáticos.

No hay `og:image`, tarjetas Twitter, metadatos por ruta ni contenido público prerenderizado. La raíz termina conduciendo al login cuando no hay sesión. La base SEO existe, pero falta una página pública útil e indexable para captar búsquedas de marca/producto.

## 3. DETECCIÓN DE DEUDA TÉCNICA Y TAREAS PENDIENTES

### Prioridades altas

| Hallazgo | Impacto y evidencia | Acción propuesta |
| --- | --- | --- |
| Rutas públicas profundas devuelven 404 | Rompe enlaces directos, recargas y retorno a `/checkout/success`; ausencia de `vercel.json` y respuestas HTTP verificadas | Configurar y desplegar fallback SPA; comprobar retornos OAuth/Stripe y archivos estáticos |
| Esquema remoto divergente y baseline incompleto | Dos migraciones exclusivas de nube, tablas/RPC ausentes de los tipos y falta de creación inicial de tablas | Recuperar el historial real, establecer baseline reproducible y regenerar tipos; no inventar migraciones equivalentes sin contrastarlas |
| Stripe y Google no operativos | Secretos Stripe ausentes y proveedor Google deshabilitado | Configurar proveedores y realizar pruebas reales de alta, pago, renovación fallida y cancelación |
| Admin y suscripción comparten un rol incompatible | La nube admite Admin; UI/RLS de academia exigen exactamente Pro. `use_life_reload` descuenta al Admin con vidas y puede violar la restricción al llegar a cero. La actualización de Stripe escribe Free/Pro y puede reemplazar Admin | Separar privilegios administrativos de la suscripción o definir reglas explícitas coherentes en todo el stack |

### Prioridades medias

1. **Recargas sin idempotencia y confirmación ambigua.** `SimulatorPage` puede completar la RPC y después fallar al refrescar datos, mostrando un error que anima a repetir una recarga ya aplicada. A diferencia de las órdenes, la recarga no tiene identificador idempotente. Separar éxito de la mutación del fallo de lectura posterior y proteger reintentos. También conviene confirmar recargas que consumirán una vida cuando el saldo todavía es alto.

2. **Promesa de actualización sin manejo completo de rechazo.** El botón de refresco del simulador ejecuta `void Promise.all([loadData(), refreshProfile()])` sin `catch`; `refreshProfile()` puede rechazar. Mostrar un error recuperable y evitar rechazos no gestionados. Los fallos silenciosos de actualización del perfil conservan el último dato, pero no muestran que esté desactualizado.

3. **Generación de precios global controlada por clientes.** La renovación altera todo el catálogo y no tiene un límite distribuido de frecuencia. Usuarios concurrentes pueden acelerar los cambios aleatorios y multiplicar carga. Mover el reloj a un proceso del servidor o aplicar una ventana global; conservar las etiquetas de simulación. La deduplicación de solicitudes en una pestaña no resuelve la concurrencia global.

4. **Compatibilidad de precios históricos de Stripe.** `stripe-webhook/index.ts` filtra suscripciones según los IDs de precios configurados actualmente. Al sustituir un precio y retirar el anterior de configuración, una suscripción antigua puede quedar fuera de reconciliación y mantener permisos obsoletos. Conservar un catálogo de precios aceptados o asociar explícitamente las suscripciones existentes; probar migraciones de precio. No hay una reconciliación periódica implementada para recuperar estados tras fallos prolongados de webhook.

5. **Criterio de valoración de cartera.** Dashboard y simulador valoran posiciones con `current_price`/ask, mientras vender se ejecuta a bid. No equivale al valor de liquidación y produce una diferencia debida al spread. Definir y mostrar claramente el criterio, o usar bid para el valor realizable.

6. **Escalabilidad de consultas.** El catálogo se descarga entero por lotes de 500 y después se filtra en cliente; no hay búsqueda remota ni virtualización. Las posiciones carecen de paginación explícita, con riesgo de truncamiento al superar el límite de respuesta. El historial está limitado a 50 sin opción de cargar más.

7. **Seguridad: revisar avisos, sin confundirlos con exploits probados.** Los advisors remotos devolvieron diez avisos: ejecución de funciones `SECURITY DEFINER` por roles de API y protección contra contraseñas filtradas desactivada. Varias RPC conocidas requieren deliberadamente esta ejecución y comprueban `auth.uid()`. `rls_auto_enable` tiene grants a `anon`/`authenticated`, pero devuelve `event_trigger`; el aviso no demuestra que pueda explotarse mediante RPC. Revisar/revocar permisos innecesarios y auditar las nuevas funciones solo presentes en nube. Referencias: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [aviso de funciones definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

8. **Tipos, rendimiento y automatización.** Los tsconfig no activan `strict`. El build genera un chunk principal de 582,51 kB sin comprimir, con advertencia de Vite; el gráfico se carga de forma diferida, pero todavía pesa 318,89 kB. Considerar división por rutas y medir antes de optimizar. No se encontró un workflow de CI en el repositorio que obligue a ejecutar las verificaciones.

### Mantenimiento y funciones no terminadas

- No se encontraron marcadores técnicos `TODO`, `FIXME`, `HACK`, `STUB` o `mhead` ni stubs explícitos en la revisión. Esto no equivale a que todo el producto esté terminado.
- `getProUpgradeRequest` y `requestProUpgrade` del servicio de Dashboard permanecen como flujo manual antiguo sin uso en la UI actual.
- Existen dos estructuras de eventos de Stripe, pública y privada, y tablas anteriores de suscripciones. Documentar cuál es la fuente de verdad y retirar lo obsoleto mediante una migración revisada.
- `App.css`, los SVG de React/Vite y `hero.png` no tienen referencias en la aplicación revisada; son candidatos a limpieza.
- `supabase/.temp` contiene metadatos de CLI versionados. Retirarlos del control de versiones si son específicos del entorno; este hallazgo no afirma que contengan claves secretas.
- El script histórico `supabase/sql/bullvest_saldo_50000.sql` y las referencias antiguas de instalación pueden inducir a configurar un saldo distinto al actual de 10.000. Marcar su carácter histórico y actualizar el procedimiento de instalación.
- La inicialización del cliente falla inmediatamente si faltan variables Vite; no hay una pantalla de configuración inválida. Validarlas en build/despliegue.
- La página de éxito hace hasta 20 consultas separadas por 1,5 segundos, pero sin plazo máximo de cada solicitud; una petición colgada puede alargar el estado de espera.
- Hay cobertura de errores/carga en los flujos principales; las carencias identificadas se concentran en refrescos posteriores a mutaciones y validación con proveedores reales, no en una ausencia general de estados UI.

## 4. PRÓXIMOS PASOS SUGERIDOS

1. **Reparar el despliegue y los retornos.** Añadir fallback SPA, incorporar `robots.txt` al repositorio y verificar enlaces directos, recargas y archivos estáticos en Vercel. Revisar las [URLs de retorno de Supabase Auth](https://supabase.com/docs/guides/auth/redirect-urls). Añadir una landing pública y una imagen social si la captación SEO es objetivo de la siguiente fase.

2. **Unificar base de datos, tipos y permisos.** Recuperar las dos migraciones ausentes, reconstruir una instalación limpia verificable, regenerar tipos y definir Admin independientemente de Free/Pro. Revisar políticas y grants de los objetos remotos adicionales antes de conectarlos a la UI.

3. **Cerrar la integración real con proveedores.** Configurar Google y los secretos Stripe de Test Mode, el portal y los webhooks. Probar alta OAuth, Checkout, Pro confirmado por webhook, pago fallido, recuperación, cancelación y eventos duplicados/desordenados. No considerar completado este punto por pasar mocks.

4. **Robustecer el simulador.** Hacer idempotentes las recargas, distinguir fallos de refresco de operaciones ya confirmadas, centralizar la renovación de cotizaciones y definir el valor de cartera con bid/ask. Añadir casos de concurrencia y respuesta de red perdida.

5. **Establecer controles de entrega.** Incorporar CI con build/lint/tests, validación de migraciones y pruebas reales en un entorno aislado; activar TypeScript estricto progresivamente, dividir cargas por rutas y mejorar observabilidad de Edge Functions/webhooks. Añadir paginación conforme crezca el catálogo y el historial.

### Criterio de cierre antes de la siguiente fase

Un clon limpio debe poder reproducir el esquema; las rutas directas deben responder correctamente; un usuario debe registrarse con Google, pagar en Test Mode, recibir Pro desde un webhook firmado y gestionar su suscripción; Free debe consumir exactamente una vida por recarga confirmada sin que un reintento duplique el consumo. Las pruebas locales actuales ofrecen una buena base, pero aún no acreditan estos criterios completos.
