import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database.types';
import type { PerformancePeriod } from '../../dashboard/utils/performance';

type LeaderboardRow = Database['public']['Functions']['get_global_leaderboard']['Returns'][number];
export type RankedTrader = Omit<LeaderboardRow, 'roi_pct' | 'win_rate_pct'> & { roi_pct: number | null; win_rate_pct: number | null };
export type Achievements = Database['public']['Functions']['get_my_achievements']['Returns'][number];
export const RANKING_PAGE_SIZE = 20;

export async function getGlobalLeaderboard(period: PerformancePeriod, page: number, following: boolean): Promise<RankedTrader[]> {
  const { data, error } = await supabase.rpc('get_global_leaderboard', {
    p_period: period, p_limit: RANKING_PAGE_SIZE, p_offset: page * RANKING_PAGE_SIZE, p_following: following,
  });
  if (error) throw new Error('No se pudo cargar el ranking. Vuelve a intentarlo.', { cause: error });
  return data;
}
export async function getMyAchievements(): Promise<Achievements> {
  const { data, error } = await supabase.rpc('get_my_achievements');
  if (error || !data?.[0]) throw new Error('No se pudieron cargar tus insignias.');
  return data[0];
}
export async function setTraderFollowing(targetId: string, follow: boolean): Promise<void> {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) throw new Error('Vuelve a iniciar sesión.');
  if (data.user.id === targetId) throw new Error('No puedes seguirte a ti mismo.');
  const result = follow
    ? await supabase.from('trader_follows').insert({ user_id: data.user.id, followed_user_id: targetId })
    : await supabase.from('trader_follows').delete().eq('user_id', data.user.id).eq('followed_user_id', targetId);
  if (result.error && !(follow && result.error.code === '23505')) throw new Error('No se pudo actualizar el seguimiento.');
}
