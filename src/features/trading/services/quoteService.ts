import { supabase } from '../../../lib/supabase';

export interface QuoteRefreshResult {
  refreshed_count: number;
}

// Compartir solicitudes simultaneas (por ejemplo, varios consumidores React).
let pendingRefresh: Promise<QuoteRefreshResult> | null = null;

export function triggerQuoteRefresh(): Promise<QuoteRefreshResult> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = refreshQuotes().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

async function refreshQuotes(): Promise<QuoteRefreshResult> {
  const { data, error } = await supabase.functions.invoke<QuoteRefreshResult>(
    'refresh-quotes',
    { body: {} },
  );

  if (error) {
    throw new Error('No se pudieron actualizar las cotizaciones. Vuelve a intentarlo.', {
      cause: error,
    });
  }
  if (!data || !Number.isInteger(data.refreshed_count) || data.refreshed_count < 0) {
    throw new Error('La respuesta del servicio de cotizaciones no es válida.');
  }
  return data;
}
