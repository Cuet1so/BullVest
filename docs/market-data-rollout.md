# BullVest: despliegue seguro de datos reales

Estado actual: cuenta Twelve Data Basic con prueba privada AAPL confirmada.
Licencia Basic: únicamente uso interno non-display; no autoriza precios de bolsa
para los usuarios de BullVest. La cuota es 8 REST créditos/minuto y 800 diarios,
con 8 símbolos WebSocket de prueba.

## Arquitectura implementada
- market_data_control: modo simulation por defecto, licencia y almacenamiento apagados.
- market_data_instruments: mapping candidato, no verificado y no habilitado.
- market_data_candles y market_data_quotes: tablas privadas y sin acceso cliente.
- market_data_quota: reserva atómica de créditos del futuro ingestor licenciado.
- market-data-ingest: worker privado, sin cron, rechazará las llamadas sin licencia.
- market-ticker y refresh_asset_prices: actualizan solo precio de origen simulated.

## Catálogo Libertex
No existe todavía una importación verificada de todas las acciones de Libertex:
para ello es necesario un listado legítimo y actual del catálogo del bróker,
con su identificador de instrumento y su acción/bolsa subyacente. El mismo
ticker no demuestra equivalencia entre el CFD y la acción.
Para preparar mappings candidatos desde un JSON revisado:
  node scripts/prepare-market-catalog.mjs catalog/market-symbols.template.json > mappings.sql
El SQL generado deja todos los registros como unverified y disabled.

## Pendiente antes de producción
1. Licencia escrita de visualización externa, redistribución (si aplica)
   y almacenamiento temporal de cotizaciones de Twelve Data.
2. Confirmar con Twelve Data disponibilidad y capacidad para todos los
   instrumentos (y alternativas para CFDs sin correspondencia exacta).
3. Verificar cada ticker, mercado, divisa y eventos corporativos.
4. Ingestor WebSocket persistente con backpressure, control de cuotas y reconexión.
5. Gráficos OHLC autenticados con licencias, sin exposición de datos a terceros
   no autorizados. Diferenciar Bid/Ask de Last: el WebSocket no trae Bid/Ask.
6. Reconciliación de carteras y órdenes históricas antes de cambiar la
   fuente de precios; pruebas de horario de mercado y rollback.
7. Dejar el motor simulado disponible hasta pasar las pruebas de integración.

NUNCA activar market_data_control.stage=licensed_public para saltarse la licencia.
El backend permanece privado; Twelve Data API Key solo en Supabase Secrets.

Refs:
https://twelvedata.com/pricing
https://twelvedata.com/pricing-business
https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage
https://twelvedata.com/terms
