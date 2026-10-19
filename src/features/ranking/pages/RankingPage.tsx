import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Trophy, UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { PERFORMANCE_PERIODS } from '../../dashboard/utils/performance';
import type { PerformancePeriod } from '../../dashboard/utils/performance';
import { AchievementBadges, BadgeList } from '../components/AchievementBadges';
import { getGlobalLeaderboard, getMyAchievements, RANKING_PAGE_SIZE, setTraderFollowing } from '../services/rankingService';
import type { Achievements, RankedTrader } from '../services/rankingService';

const percent = (value: number | null) => value === null ? '—' : `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
const money = (value: number) => value.toLocaleString('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export function RankingPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<PerformancePeriod>('week');
  const [page, setPage] = useState(0);
  const [following, setFollowing] = useState(false);
  const [rows, setRows] = useState<RankedTrader[]>([]);
  const [achievements, setAchievements] = useState<Achievements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true); setError(null);
    try {
      const [leaders, badges] = await Promise.all([getGlobalLeaderboard(period, page, following), getMyAchievements()]);
      if (current === version.current) { setRows(leaders); setAchievements(badges); }
    } catch (failure) { if (current === version.current) setError(failure instanceof Error ? failure.message : 'No se pudo cargar el ranking.'); }
    finally { if (current === version.current) setLoading(false); }
  }, [period, page, following]);
  useEffect(() => {
    let cancelled = false;
    const requestVersion = version;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; requestVersion.current++; };
  }, [load, user?.id]);
  async function toggleFollow(trader: RankedTrader) {
    if (busyId) return;
    setBusyId(trader.user_id); setError(null);
    try {
      await setTraderFollowing(trader.user_id, !trader.is_following);
      if (page > 0 && following) setPage(0); else await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar el seguimiento.'); }
    finally { setBusyId(null); }
  }
  const total = rows[0]?.total_count ?? 0;
  const medals = ['text-amber-300 border-amber-300/30', 'text-zinc-200 border-zinc-500/40', 'text-orange-300 border-orange-400/30'];
  return (
    <div className="space-y-6 text-zinc-100">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Comunidad BullVest</p><h1 className="mt-2 text-3xl font-bold">Ranking de inversores</h1><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Sigue a otros inversores, compara resultados y convierte el aprendizaje en logros.</p></div><button type="button" disabled={loading} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Actualizar ranking</button></header>
      <div className="flex flex-wrap items-center justify-between gap-4"><div role="group" aria-label="Periodo del ranking" className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">{PERFORMANCE_PERIODS.map((item) => <button key={item.id} type="button" aria-pressed={item.id === period} onClick={() => { if (period !== item.id) { setPeriod(item.id); setPage(0); setRows([]); } }} className={`rounded-lg px-4 py-2 text-sm ${period === item.id ? 'bg-zinc-800 text-emerald-300' : 'text-zinc-400'}`}>{item.label}</button>)}</div><label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={following} onChange={(event) => { setFollowing(event.target.checked); setPage(0); setRows([]); }} className="accent-emerald-400" />Solo inversores que sigo</label></div>
      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">{error} <button type="button" onClick={() => void load()} className="underline">Reintentar ranking</button></p>}
      {page === 0 && !following && rows.length > 0 && <div className="grid gap-4 sm:grid-cols-3" aria-label="Podio del ranking">{rows.filter((row) => row.rank <= 3).map((row) => <article key={row.user_id} className={`rounded-2xl border bg-zinc-900/60 p-5 ${medals[row.rank - 1]}`}><div className="flex items-center justify-between"><Trophy className="size-7" /><span className="text-xs font-bold">TOP {row.rank}</span></div><h2 className="mt-4 truncate text-lg font-semibold text-zinc-100">{row.display_name}</h2><p className="mt-2 text-3xl font-semibold tabular-nums">{percent(row.roi_pct)}</p><p className="mt-1 text-xs text-zinc-500">ROI ajustado por recargas</p></article>)}</div>}
      <section aria-label="Clasificación global" className="min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50" aria-busy={loading}>
        {loading && rows.length === 0 ? <p role="status" className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-400"><LoaderCircle className="size-5 animate-spin" />Cargando clasificación…</p> : rows.length === 0 ? <p className="p-12 text-center text-sm text-zinc-400">{following ? 'Todavía no sigues a ningún inversor. Explora el ranking global para empezar.' : 'No hay resultados disponibles para este periodo.'}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-zinc-800 bg-zinc-900 text-xs text-zinc-400"><tr>{['Puesto', 'Inversor', 'Patrimonio total', 'ROI', 'Win Rate', 'Seguimiento'].map((title) => <th key={title} scope="col" className="px-4 py-4 text-left font-medium">{title}</th>)}</tr></thead><tbody className="divide-y divide-zinc-800/60">{rows.map((row) => <tr key={row.user_id} className={row.user_id === user?.id ? 'bg-emerald-400/5' : ''}>
          <td className="px-4 py-4 font-semibold text-zinc-400">{row.rank <= 3 ? <span aria-label={`Medalla puesto ${row.rank}`} className={medals[row.rank - 1].split(' ')[0]}>{['🥇', '🥈', '🥉'][row.rank - 1]}</span> : `#${row.rank}`}</td>
          <th scope="row" className="max-w-52 px-4 py-4 text-left font-medium"><span className="block truncate">{row.display_name}{row.user_id === user?.id && <span className="ml-2 text-xs text-emerald-300">Tú</span>}</span><div className="mt-2"><BadgeList ids={row.badges} /></div><span className="mt-1 block text-[10px] font-normal text-zinc-500">Desde {new Date(row.measured_since).toLocaleDateString('es-ES', { timeZone: 'UTC' })}</span></th>
          <td className="whitespace-nowrap px-4 py-4 tabular-nums">{money(row.total_equity)}</td><td className={`whitespace-nowrap px-4 py-4 font-semibold tabular-nums ${row.roi_pct !== null && row.roi_pct < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{percent(row.roi_pct)}</td><td className="px-4 py-4 tabular-nums">{percent(row.win_rate_pct)}<span className="mt-1 block text-[10px] text-zinc-500">{row.sell_count} ventas</span></td>
          <td className="px-4 py-4">{row.user_id === user?.id ? <span className="text-xs text-zinc-500">Tu cuenta</span> : <button type="button" disabled={busyId !== null || loading} aria-label={`${row.is_following ? 'Dejar de seguir a' : 'Seguir a'} ${row.display_name}`} onClick={() => void toggleFollow(row)} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs disabled:opacity-50 ${row.is_following ? 'border-emerald-400/20 text-emerald-300' : 'border-zinc-700 text-zinc-300'}`}>{row.is_following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}{row.is_following ? 'Siguiendo' : 'Seguir'}</button>}</td>
        </tr>)}</tbody></table></div>}
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-4 text-xs text-zinc-400"><span>{total} inversores · Página {page + 1}</span><div className="flex gap-2"><button type="button" aria-label="Página anterior" disabled={page === 0 || loading} onClick={() => setPage(page - 1)} className="rounded-lg border border-zinc-700 p-2 disabled:opacity-30"><ChevronLeft className="size-4" /></button><button type="button" aria-label="Página siguiente" disabled={(page + 1) * RANKING_PAGE_SIZE >= total || loading} onClick={() => setPage(page + 1)} className="rounded-lg border border-zinc-700 p-2 disabled:opacity-30"><ChevronRight className="size-4" /></button></div></div>
      </section>
      <p className="text-xs leading-5 text-zinc-500">Semanal: últimos 7 días. Mensual: últimos 30 días. Se usan las observaciones disponibles desde la fecha indicada. ROI aproximado mediante Modified Dietz, descontando las recargas; Win Rate sobre ventas con P/L conocido. Seguir a alguien no copia sus operaciones. Todos los importes son ficticios.</p>
      {achievements && <AchievementBadges progress={achievements} />}
    </div>
  );
}
