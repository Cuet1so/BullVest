import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database.types';

export type PriceAlert = Database['public']['Tables']['price_alerts']['Row'] & { asset: { ticker: string; name: string; currency: string } | null };
export type AlertDirection = 'above' | 'below';
async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Vuelve a iniciar sesión para gestionar tus alertas.');
  return data.user.id;
}
export async function getPriceAlerts(): Promise<PriceAlert[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('price_alerts')
    .select('*, asset:assets!price_alerts_asset_id_fkey(ticker,name,currency)')
    .eq('user_id', userId).order('created_at', { ascending: false }).order('id').limit(100);
  if (error) throw new Error('No se pudieron cargar las notificaciones.', { cause: error });
  return data;
}
export async function createPriceAlert(assetId: string, direction: AlertDirection, price: string): Promise<void> {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(price) || !Number.isFinite(Number(price)) || Number(price) <= 0) {
    throw new Error('Introduce un precio positivo con hasta ocho decimales.');
  }
  const userId = await currentUserId();
  const { error } = await supabase.from('price_alerts').insert({ user_id: userId, asset_id: assetId, direction, target_price: Number(price) });
  if (error) throw new Error(error.message.includes('ALERT_LIMIT_REACHED') ? 'Has alcanzado las 100 alertas. Elimina alguna para crear otra.' : 'No se pudo crear la alerta.');
}
export async function markPriceAlertRead(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('price_alerts').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).eq('status', 'triggered');
  if (error) throw new Error('No se pudo marcar la notificación como leída.');
}
export async function deletePriceAlert(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('price_alerts').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error('No se pudo eliminar la alerta.');
}
