import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, Crown, GraduationCap, LoaderCircle } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { SubscriptionActions } from '../../subscription/components/SubscriptionActions';
import { ACADEMY_V2_CATALOG } from './curriculum';
import { AcademyExercise } from './AcademyExercise';
import { AcademyMarkdown } from './AcademyMarkdown';
import { getAcademyV2Lesson, getAcademyV2Progress } from './academyV2Service';
import type { AcademyProgressV2 } from './academyV2Service';

type LessonPayload = Awaited<ReturnType<typeof getAcademyV2Lesson>>;

export function AcademyV2LessonPage() {
  const { moduleSlug, lessonSlug } = useParams<{ moduleSlug: string; lessonSlug: string }>();
  const { profile } = useAuth();
  const isPro = profile?.role === 'pro' || profile?.role === 'admin';

  const [data, setData] = useState<LessonPayload | null>(null);
  const [progress, setProgress] = useState<AcademyProgressV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const courseModule = ACADEMY_V2_CATALOG.find((module) => module.slug === moduleSlug);
  const courseLesson = courseModule?.lessons.find((lesson) => lesson.slug === lessonSlug);

  useEffect(() => {
    if (!moduleSlug || !lessonSlug) return;
    let cancelled = false;
    void Promise.all([
      getAcademyV2Lesson(moduleSlug, lessonSlug),
      getAcademyV2Progress(),
    ]).then(([lessonResult, progressResult]) => {
      if (!cancelled) {
        setData(lessonResult);
        setProgress(progressResult);
      }
    }).catch((failure: unknown) => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : 'No se pudo abrir esta lección.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [moduleSlug, lessonSlug]);

  const lesson = data?.lesson;
  const completed = !!lesson && progress.some((item) =>
    item.lesson_id === lesson.id && item.lesson_version === lesson.content_version && item.status === 'completed'
  );
  const locked = courseModule ? courseModule.level > 1 && !isPro : false;

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-20 text-zinc-100">
      <Link to="/academia" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-emerald-300">
        <ArrowLeft className="size-4" aria-hidden="true" /> Volver al temario
      </Link>

      <header className="rounded-3xl border border-zinc-800 bg-zinc-900/75 p-6 sm:p-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
          <GraduationCap className="size-4" /> Nivel {courseModule?.level ?? '—'} · {courseModule?.title ?? 'Academia'}
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">
          {courseLesson?.title ?? 'Lección no encontrada'}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
          {lesson && <span className="inline-flex items-center gap-2"><Clock3 className="size-4" /> {lesson.estimated_minutes} min de estudio</span>}
          {lesson && <span>Versión de contenido {lesson.content_version}</span>}
          {completed && <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="size-4" /> Completada</span>}
        </div>
      </header>

      {loading && <p role="status" className="flex items-center gap-3 rounded-xl border border-zinc-800 p-6 text-zinc-400"><LoaderCircle className="size-5 animate-spin" /> Cargando la lección y tus resultados…</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-5 text-sm text-rose-200">{error}</p>}

      {!loading && !error && locked && <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-7">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-amber-200"><Crown className="size-5" /> Esta lección requiere Pro</h2>
        <p className="my-4 text-sm leading-7 text-zinc-300">Los niveles del 2 al 5 están disponibles para suscriptores Pro cuando se publica su contenido.</p>
        <div className="max-w-60"><SubscriptionActions /></div>
      </div>}

      {!loading && !error && !locked && !lesson && <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-7">
        <h2 className="text-lg font-semibold">Contenido en preparación</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Esta lección figura en el plan de estudios, pero aún no se ha publicado su contenido evaluable.
          Puedes continuar con la Academia anterior desde el índice.
        </p>
      </div>}

      {!loading && lesson && !locked && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="min-w-0 space-y-8">
          {lesson.learning_objectives.length > 0 && <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-300">Al terminar sabrás</h2>
            <ul className="ml-5 list-disc space-y-2 text-sm leading-6 text-zinc-300">
              {lesson.learning_objectives.map((objective) => <li key={objective}>{objective}</li>)}
            </ul>
          </section>}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-8">
            <AcademyMarkdown content={lesson.body_markdown} />
          </section>

          <section aria-label="Ejercicios prácticos" className="space-y-5">
            <div className="border-b border-zinc-800 pb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Laboratorio</p>
              <h2 className="mt-2 text-2xl font-bold">Practica lo aprendido</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Resuelve todos los ejercicios obligatorios para completar la lección. Las respuestas se corrigen en Supabase.
              </p>
            </div>
            {data?.exercises.map((exercise) => <AcademyExercise
              key={exercise.id}
              exercise={exercise}
              onProgressChanged={async (result) => {
                setFeedback(result.lesson_completed ? '¡Lección completada! Tu progreso ha quedado guardado.' :
                  'Progreso guardado: ' + result.lesson_score + '% de ejercicios obligatorios superados.');
                const latest = await getAcademyV2Progress();
                setProgress(latest);
              }}
            />)}
            {data?.exercises.length === 0 && <p className="text-sm text-zinc-500">Los ejercicios de esta lección aún no están disponibles.</p>}
            {feedback && <div role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-200">{feedback}</div>}
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:sticky lg:top-28">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-emerald-300" /> En este módulo</h2>
          <ol className="space-y-3 text-sm">
            {courseModule?.lessons.map((item, index) =>
              <li key={item.slug} className={item.slug === lessonSlug ? 'font-medium text-emerald-300' : 'text-zinc-500'}>
                <span className="mr-2 tabular-nums">{index + 1}.</span>{item.title}
              </li>
            )}
          </ol>
        </aside>
      </div>}

      <p className="text-xs text-zinc-500">Contenido educativo original y datos ficticios. No supone una recomendación de inversión.</p>
    </div>
  );
}
