import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronRight, Clock3, Crown, GraduationCap, LockKeyhole, Sparkles } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { SubscriptionActions } from '../../subscription/components/SubscriptionActions';
import { ACADEMY_V2_CATALOG } from './curriculum';
import { getAcademyV2State } from './academyV2Service';
import type { AcademyV2State } from './academyV2Service';

const LEVEL_NAMES = [
  'Fundamentos financieros',
  'Valoración cuantitativa',
  'Investigación empresarial',
  'Análisis técnico',
  'Gestión profesional',
] as const;

export function AcademyV2Page() {
  const { profile } = useAuth();
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [academy, setAcademy] = useState<AcademyV2State | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pro = profile?.role === 'pro' || profile?.role === 'admin';
  const allLessons = ACADEMY_V2_CATALOG.reduce((sum, module) => sum + module.lessons.length, 0);
  const modules = ACADEMY_V2_CATALOG.filter((module) => module.level === selectedLevel);

  useEffect(() => {
    let cancelled = false;
    void getAcademyV2State().then((result) => {
      if (!cancelled) setAcademy(result);
    }).catch((failure: unknown) => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : 'No se pudo cargar la academia.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const completed = useMemo(() => {
    if (!academy) return 0;
    const published = new Map(academy.lessons.map((lesson) => [lesson.id, lesson.content_version]));
    return academy.progress.filter((item) =>
      item.status === 'completed' && published.get(item.lesson_id) === item.lesson_version
    ).length;
  }, [academy]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16 text-zinc-100">
      <header className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-linear-to-br from-emerald-950/65 via-zinc-900 to-zinc-950 px-6 py-9 sm:px-10 sm:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-72 rounded-full bg-emerald-400/5 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">
            <GraduationCap className="size-5" aria-hidden="true" /> BullVest Academy 2.0
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
            Comprende el negocio. <span className="text-emerald-300">Domina el riesgo.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Una ruta estructurada de contabilidad, valoración, análisis técnico y gestión monetaria.
            Aprende con ejemplos originales y practica cada concepto con ejercicios evaluados en el servidor.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-5 text-sm text-zinc-300">
            <span className="inline-flex items-center gap-2"><BookOpen className="size-4 text-emerald-300" /> {allLessons} lecciones planificadas</span>
            <span className="inline-flex items-center gap-2"><GraduationCap className="size-4 text-emerald-300" /> 13 módulos</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-300" /> {completed} completadas en V2</span>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Ruta de aprendizaje</h2>
          <p className="mt-1 text-sm text-zinc-400">
            El temario está publicado como índice; el contenido completo se incorporará progresivamente.
          </p>
        </div>
        <Link to="/academia/clasica" className="text-sm font-medium text-emerald-300 underline-offset-4 hover:underline">
          Acceder a la Academia anterior
        </Link>
      </div>

      <nav aria-label="Seleccionar nivel de academia" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {LEVEL_NAMES.map((name, index) => {
          const level = index + 1;
          const active = selectedLevel === level;
          const locked = level > 1 && !pro;
          return <button key={name} type="button" onClick={() => setSelectedLevel(level)}
            aria-pressed={active}
            className={'min-h-23 rounded-2xl border p-3 text-left transition ' +
              (active ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600')}>
            <span className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-emerald-300">
              Nivel {level} {locked && <LockKeyhole className="size-3.5 text-amber-300" aria-label="Pro" />}
            </span>
            <span className="mt-2 block text-xs font-medium leading-5 text-zinc-200">{name}</span>
          </button>;
        })}
      </nav>

      {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div>}
      {loading && <div role="status" className="rounded-xl border border-zinc-800 p-6 text-sm text-zinc-400">Cargando contenidos disponibles…</div>}

      <section className="space-y-5" aria-label={'Módulos de nivel ' + selectedLevel}>
        {modules.map((module, moduleIndex) => {
          const dbModule = academy?.modules.find((item) => item.slug === module.slug);
          const accessible = module.level === 1 || pro;
          return <div key={module.slug} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/55">
            <div className="border-b border-zinc-800 px-5 py-5 sm:px-7">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                  Módulo {String(ACADEMY_V2_CATALOG.indexOf(module) + 1).padStart(2, '0')}
                </span>
                <span className="text-xs text-zinc-500">{module.lessons.length} lecciones</span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-white">{module.title}</h3>
              <p className="mt-1 text-xs text-zinc-400">{module.author}</p>
            </div>
            <ol className="divide-y divide-zinc-800/80">
              {module.lessons.map((lesson, lessonIndex) => {
                const dbLesson = academy?.lessons.find((item) => item.module_id === dbModule?.id && item.slug === lesson.slug);
                const progress = dbLesson ? academy?.progress.find((item) =>
                  item.lesson_id === dbLesson.id && item.lesson_version === dbLesson.content_version
                ) : null;
                const isCompleted = progress?.status === 'completed';
                const available = accessible && !!dbLesson && dbLesson.body_markdown.trim().length > 0;
                return <li key={lesson.slug}>
                  {available ? (
                    <Link to={'/academia/' + module.slug + '/' + lesson.slug}
                      className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-zinc-800/60 sm:px-7">
                      <span className="flex items-start gap-3">
                        {isCompleted ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" /> :
                          <BookOpen className="mt-0.5 size-5 shrink-0 text-zinc-500" />}
                        <span className="text-sm text-zinc-200">
                          <span className="mr-2 text-zinc-500">{moduleIndex + 1}.{lessonIndex + 1}</span>
                          {lesson.title}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-emerald-300">
                        {isCompleted ? 'Completada' : 'Estudiar'}
                        <ChevronRight className="size-4" />
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-5 py-4 text-sm text-zinc-400 sm:px-7">
                      <span className="flex items-start gap-3">
                        <Clock3 className="mt-0.5 size-5 shrink-0 text-zinc-600" />
                        <span>
                          <span className="mr-2 text-zinc-600">{moduleIndex + 1}.{lessonIndex + 1}</span>
                          {lesson.title}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">{accessible ? 'Próximamente' : 'Pro'}</span>
                    </div>
                  )}
                </li>;
              })}
            </ol>
          </div>;
        })}
      </section>

      {selectedLevel > 1 && !pro && <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6">
        <div className="mb-3 flex items-center gap-2 text-amber-300"><Crown className="size-5" /><h3 className="font-semibold">Formación avanzada con Pro</h3></div>
        <p className="mb-5 max-w-2xl text-sm leading-6 text-zinc-300">
          El Nivel 1 es gratuito. Los niveles 2–5 se activarán progresivamente dentro del plan Pro.
          Puedes seguir utilizando la Academia anterior mientras completamos la nueva edición.
        </p>
        <div className="max-w-64"><SubscriptionActions /></div>
      </div>}

      <p className="flex items-start gap-2 text-xs leading-6 text-zinc-500">
        <Sparkles className="mt-0.5 size-4 shrink-0" />
        Contenido educativo original con referencias académicas a Wild, Greenblatt, Fisher, Murphy, Weinstein y Tharp.
        Las empresas y las cifras de los ejercicios son ficticias. No constituye asesoramiento financiero.
      </p>
    </div>
  );
}
