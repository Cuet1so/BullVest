import { useCallback, useEffect, useRef, useState } from 'react';
import { GraduationCap, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { LevelCard } from '../components/LevelCard';
import { LessonViewer } from '../components/LessonViewer';
import { UpgradePaywallModal } from '../components/UpgradePaywallModal';
import { getAcademyLevels, getUserProgress } from '../services/academyService';
import type { AcademyLevel, LessonSummary, UserAcademyProgress } from '../services/academyService';

export function AcademyPage() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const isPro = profile?.role === 'pro';
  const [data, setData] = useState<{ userId: string; levels: AcademyLevel[]; progress: UserAcademyProgress[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLesson, setActiveLesson] = useState<LessonSummary | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const version = useRef(0);

  const loadAcademy = useCallback(async () => {
    if (!userId) return;
    const current = ++version.current;
    setLoading(true); setError(null);
    try {
      const [levels, progress] = await Promise.all([getAcademyLevels(), getUserProgress()]);
      if (version.current === current) setData({ userId, levels, progress });
    } catch (failure) {
      if (version.current === current) setError(failure instanceof Error ? failure.message : 'No se pudo cargar la academia.');
    } finally { if (version.current === current) setLoading(false); }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadAcademy(); });
    return () => { cancelled = true; version.current += 1; };
  }, [loadAcademy, isPro]);

  async function refreshProgress() {
    const current = version.current;
    try {
      const progress = await getUserProgress();
      if (current === version.current) setData((previous) => previous && previous.userId === userId ? { ...previous, progress } : previous);
    } catch {
      if (current === version.current) setError('El resultado se ha guardado, pero no se pudo actualizar la barra de progreso. Pulsa Actualizar.');
    }
  }

  const currentData = data?.userId === userId ? data : null;
  const levels = currentData?.levels ?? [];
  const progress = currentData?.progress ?? [];
  const total = levels.reduce((sum, level) => sum + level.lessonCount, 0);
  const completed = Math.min(total, progress.filter((item) => item.completed).length);
  const percent = total > 0 ? Math.round(completed / total * 100) : 0;
  const activeLevel = levels.find((level) => level.id === activeLesson?.level_id);
  const canReadActive = activeLevel?.accessible && (activeLevel.number === 1 || isPro);

  return (
    <div className="mx-auto max-w-4xl space-y-8 text-zinc-100">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Academia BullVest</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Aprende. Practica. Decide.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">Una ruta de cinco niveles para comprender los negocios, interpretar el mercado y gestionar el riesgo.</p></div><button type="button" onClick={() => void loadAcademy()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button></header>
      {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}<button type="button" onClick={() => void loadAcademy()} disabled={loading} className="ml-3 underline">Reintentar</button></div>}
      {currentData && <section aria-labelledby="learning-progress" className="rounded-2xl border border-emerald-400/20 bg-linear-to-br from-emerald-950/60 to-zinc-900 p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><GraduationCap className="size-8 text-emerald-300" aria-hidden="true" /><div><h2 id="learning-progress" className="font-semibold">Tu progreso de aprendizaje</h2><p className="mt-1 text-sm text-zinc-400">{completed}/{total} lecciones completadas</p></div></div><span className="text-3xl font-semibold text-emerald-300 tabular-nums">{percent} %</span></div><div role="progressbar" aria-label="Progreso global" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${percent}%` }} /></div><p className="mt-3 text-xs text-zinc-500">{isPro ? 'Tienes acceso a los cinco niveles.' : 'Empieza gratis con el Nivel 1. Los niveles 2–5 están incluidos en Pro.'}</p></section>}
      {loading && !currentData ? <div role="status" className="space-y-5"><span className="sr-only">Cargando academia…</span>{[1, 2, 3].map((i) => <div key={i} aria-hidden="true" className="h-48 rounded-2xl border border-zinc-800 bg-zinc-900 motion-safe:animate-pulse" />)}</div> : <ol aria-label="Ruta de cinco niveles" className="relative space-y-6 before:absolute before:inset-y-6 before:left-4 before:w-px before:bg-zinc-800 sm:before:left-5">{levels.map((level) => <li key={level.number} className="relative pl-12 sm:pl-16"><span aria-hidden="true" className={`absolute left-0 top-6 flex size-8 items-center justify-center rounded-full border text-sm font-bold sm:size-10 ${level.accessible && (isPro || level.number === 1) ? 'border-emerald-400/40 bg-emerald-950 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-500'}`}>{level.number}</span><LevelCard level={level} progress={progress} locked={!level.accessible || (level.number > 1 && !isPro)} onOpen={setActiveLesson} onUpgrade={() => setShowPaywall(true)} /></li>)}</ol>}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-500"><ShieldCheck className="size-4 shrink-0" aria-hidden="true" />Contenido educativo original, con autores de referencia. Los ejemplos son hipotéticos y no constituyen recomendaciones de inversión.</p>
      {activeLesson && activeLevel && canReadActive && <LessonViewer key={activeLesson.id} lesson={activeLesson} level={activeLevel} onClose={() => setActiveLesson(null)} onNavigate={setActiveLesson} onProgressChanged={refreshProgress} />}
      {showPaywall && <UpgradePaywallModal onClose={() => setShowPaywall(false)} />}
    </div>
  );
}
