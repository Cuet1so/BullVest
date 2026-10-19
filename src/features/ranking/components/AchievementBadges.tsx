import { Award, BookOpen, GraduationCap, Medal, TrendingUp } from 'lucide-react';
import type { Achievements } from '../services/rankingService';

const BADGES = [
  { id: 'first_trade', name: 'Primer movimiento', description: 'Realiza tu primera operación', Icon: TrendingUp, target: 1, metric: 'trade_count' },
  { id: 'ten_trades', name: 'En marcha', description: 'Completa 10 operaciones', Icon: Award, target: 10, metric: 'trade_count' },
  { id: 'first_win', name: 'Primera victoria', description: 'Cierra una venta con beneficio', Icon: Medal, target: 1, metric: 'winning_sells' },
  { id: 'first_lesson', name: 'Primer aprendizaje', description: 'Aprueba tu primera lección', Icon: BookOpen, target: 1, metric: 'completed_lessons' },
  { id: 'academy_graduate', name: 'Academia completa', description: 'Aprueba las 15 lecciones', Icon: GraduationCap, target: 15, metric: 'completed_lessons' },
] as const;

export function BadgeList({ ids }: { ids: string[] }) {
  return <div className="flex flex-wrap gap-1.5">{BADGES.filter((badge) => ids.includes(badge.id)).map(({ id, name, Icon }) => <span key={id} title={name} className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 p-1.5 text-amber-300"><Icon className="size-3" aria-hidden="true" /><span className="sr-only">{name}</span></span>)}</div>;
}
export function AchievementBadges({ progress }: { progress: Achievements }) {
  return <section aria-labelledby="my-badges" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 id="my-badges" className="text-lg font-semibold">Tus insignias</h2><span className="text-xs text-zinc-400">{progress.badges.length}/{BADGES.length} desbloqueadas</span></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{BADGES.map(({ id, name, description, Icon, metric, target }) => {
      const unlocked = progress.badges.includes(id);
      return <div key={id} className={`rounded-xl border p-4 ${unlocked ? 'border-amber-400/25 bg-amber-400/5' : 'border-zinc-800 bg-zinc-950/40'}`}>
        <Icon className={`mb-3 size-6 ${unlocked ? 'text-amber-300' : 'text-zinc-600'}`} aria-hidden="true" />
        <h3 className={`text-sm font-semibold ${unlocked ? 'text-zinc-100' : 'text-zinc-400'}`}>{name}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
        <p className={`mt-3 text-xs ${unlocked ? 'text-amber-300' : 'text-zinc-500'}`}>{unlocked ? 'Desbloqueada' : `${Math.min(progress[metric], target)}/${target}`}</p>
      </div>;
    })}</div>
  </section>;
}
