import { ArrowRight, BookOpen, CheckCircle2, Circle, Clock3, LockKeyhole } from 'lucide-react';
import type { AcademyLevel, LessonSummary, UserAcademyProgress } from '../services/academyService';

interface LevelCardProps {
  level: AcademyLevel;
  progress: UserAcademyProgress[];
  locked: boolean;
  onOpen: (lesson: LessonSummary) => void;
  onUpgrade: () => void;
}

export function LevelCard({ level, progress, locked, onOpen, onUpgrade }: LevelCardProps) {
  const completed = level.lessons.filter((lesson) => progress.some((item) => item.lesson_id === lesson.id && item.completed)).length;
  const started = level.lessons.some((lesson) => progress.some((item) => item.lesson_id === lesson.id));
  const finished = level.lessonCount > 0 && completed === level.lessonCount;
  const StateIcon = locked ? LockKeyhole : finished ? CheckCircle2 : started ? Clock3 : BookOpen;
  const stateLabel = locked ? 'Bloqueado' : finished ? 'Completado' : started ? 'En curso' : 'Por empezar';
  const next = level.lessons.find((lesson) => !progress.some((item) => item.lesson_id === lesson.id && item.completed)) ?? level.lessons[0];
  return (
    <article aria-labelledby={`level-${level.number}`} className={`rounded-2xl border p-5 sm:p-6 ${locked ? 'border-zinc-800 bg-zinc-900/40' : 'border-emerald-400/20 bg-zinc-900/80'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className={`rounded-full px-2.5 py-1 font-bold tracking-wide ${level.number === 1 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{level.number === 1 ? 'GRATIS' : 'PRO'}</span>
        <span className={`flex items-center gap-1.5 ${finished && !locked ? 'text-emerald-300' : 'text-zinc-400'}`}><StateIcon className="size-4" aria-hidden="true" />{stateLabel}</span>
      </div>
      <h2 id={`level-${level.number}`} className="mt-4 text-xl font-semibold tracking-tight">{level.title}</h2>
      <p className="mt-1 text-xs text-emerald-300/80">Referencia: {level.author}</p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">{level.description}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400"><span>{level.lessonCount} lecciones · Un test por lección</span>{!locked && <span>{completed}/{level.lessonCount} completadas</span>}</div>
      {!locked && <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true"><div className="h-full bg-emerald-400" style={{ width: `${level.lessonCount ? completed / level.lessonCount * 100 : 0}%` }} /></div>}
      {!locked && <ul className="mt-4 space-y-1">
        {level.lessons.map((lesson) => {
          const done = progress.some((item) => item.lesson_id === lesson.id && item.completed);
          return <li key={lesson.id}><button type="button" onClick={() => onOpen(lesson)} className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-emerald-300">{done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-zinc-600" aria-hidden="true" />}<span>{lesson.order_index}. {lesson.title}{done && <span className="sr-only"> — Completada</span>}</span></button></li>;
        })}
      </ul>}
      <button type="button" disabled={!locked && !next} onClick={() => locked ? onUpgrade() : next && onOpen(next)} className={`mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${locked ? 'border border-zinc-700 text-zinc-200 hover:bg-zinc-800' : 'bg-emerald-400 text-zinc-950 hover:bg-emerald-300'}`}>{locked ? 'Desbloquear con Pro' : finished ? 'Repasar nivel' : started ? 'Continuar nivel' : 'Empezar nivel'}{locked ? <LockKeyhole className="size-4" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}</button>
    </article>
  );
}
