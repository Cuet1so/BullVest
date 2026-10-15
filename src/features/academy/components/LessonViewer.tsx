import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Lightbulb, LoaderCircle } from 'lucide-react';
import { getLessonContent, getLessonQuiz } from '../services/academyService';
import type { AcademyLevel, LessonQuiz, LessonSummary } from '../services/academyService';
import type { LessonContent } from '../utils/academyContent';
import { AcademyDialog } from './AcademyDialog';
import { QuizModule } from './QuizModule';

export function LessonViewer({ lesson, level, onClose, onNavigate, onProgressChanged }: {
  lesson: LessonSummary;
  level: AcademyLevel;
  onClose: () => void;
  onNavigate: (lesson: LessonSummary) => void;
  onProgressChanged: () => Promise<void>;
}) {
  const [content, setContent] = useState<LessonContent | null>(null);
  const [quiz, setQuiz] = useState<LessonQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [quizLoading, setQuizLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const index = level.lessons.findIndex((item) => item.id === lesson.id);

  useEffect(() => {
    let cancelled = false;
    void getLessonContent(lesson.id).then((next) => { if (!cancelled) setContent(next); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'No se pudo abrir la lección.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lesson.id, attempt]);

  async function openQuiz() {
    setQuizLoading(true);
    setError(null);
    try { setQuiz(await getLessonQuiz(lesson.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo abrir el test.'); }
    finally { setQuizLoading(false); }
  }

  return (
    <AcademyDialog title={lesson.title} onClose={onClose}>
      <p className="mb-5 text-xs font-medium uppercase tracking-wide text-emerald-300">Nivel {level.number} · Lección {index + 1} de {level.lessonCount}</p>
      {loading && <p role="status" className="flex items-center gap-2 py-12 text-zinc-400"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" />Cargando lección…</p>}
      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}{!content && <button type="button" onClick={() => { setLoading(true); setError(null); setAttempt((previous) => previous + 1); }} className="ml-2 underline">Reintentar</button>}</div>}
      {quiz ? <QuizModule quiz={quiz} onProgressChanged={onProgressChanged} onReadAgain={() => setQuiz(null)} /> : content && (
        <div className="space-y-6">
          <p className="text-base leading-7 text-zinc-300">{content.introduction}</p>
          {content.sections.map((section, i) => <section key={i}><h3 className="text-lg font-semibold">{section.title}</h3><p className="mt-2 text-sm leading-7 text-zinc-400">{section.text}</p></section>)}
          <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="size-4 text-sky-300" aria-hidden="true" />Ejemplo práctico</h3><p className="mt-3 text-sm leading-7 text-zinc-300">{content.example}</p></section>
          <section className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-5"><h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Lightbulb className="size-4" aria-hidden="true" />Qué debes recordar</h3><p className="mt-3 text-sm leading-7 text-zinc-300">{content.takeaway}</p></section>
          <p className="text-xs leading-relaxed text-zinc-500">Material original de BullVest. Lectura complementaria: <a href={content.source.url} target="_blank" rel="noopener noreferrer" className="text-zinc-300 underline underline-offset-2">{content.source.title}</a>.</p>
          <button type="button" disabled={quizLoading} onClick={() => void openQuiz()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50">{quizLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}{quizLoading ? 'Abriendo test…' : 'Iniciar test'}</button>
        </div>
      )}
      {!quiz && <nav aria-label="Navegación entre lecciones" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-5">
        <button type="button" disabled={index <= 0 || quizLoading} onClick={() => onNavigate(level.lessons[index - 1])} className="inline-flex items-center gap-2 text-sm text-zinc-300 disabled:opacity-30"><ArrowLeft className="size-4" aria-hidden="true" />Anterior</button>
        {index < level.lessons.length - 1 ? <button type="button" disabled={quizLoading} onClick={() => onNavigate(level.lessons[index + 1])} className="inline-flex items-center gap-2 text-sm text-emerald-300">Siguiente lección<ArrowRight className="size-4" aria-hidden="true" /></button> : <button type="button" onClick={onClose} className="text-sm text-emerald-300">Volver a la ruta</button>}
      </nav>}
    </AcademyDialog>
  );
}
