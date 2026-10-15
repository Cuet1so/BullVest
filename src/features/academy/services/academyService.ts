import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database.types';
import { ACADEMY_CATALOG, parseLessonContent, parseQuizQuestions } from '../utils/academyContent';
import type { LessonContent, QuizQuestion } from '../utils/academyContent';

export type UserAcademyProgress = Database['public']['Tables']['user_academy_progress']['Row'];
export type LessonSummary = Pick<Database['public']['Tables']['academy_lessons']['Row'], 'id' | 'level_id' | 'title' | 'order_index'>;
export interface AcademyLevel {
  id: string | null;
  number: number;
  title: string;
  author: string;
  description: string;
  lessons: LessonSummary[];
  lessonCount: number;
  accessible: boolean;
}
export interface LessonQuiz {
  lessonId: string;
  passingScore: number;
  questions: QuizQuestion[];
}
export type QuizResult = Database['public']['Functions']['submit_academy_quiz']['Returns'][number];

function academyError(error: { message: string }): Error {
  const messages: Record<string, string> = {
    UNAUTHORIZED: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
    ACADEMY_REQUIRES_PRO: 'Este nivel requiere una cuenta Pro.',
    QUIZ_PASS_REQUIRED: 'Debes aprobar el cuestionario antes de completar la lección.',
    INVALID_QUIZ_ANSWERS: 'Responde a todas las preguntas con una opción válida.',
    LESSON_NOT_FOUND: 'La lección ya no está disponible.',
  };
  return new Error(messages[error.message] ?? 'No se pudo guardar el progreso. Vuelve a intentarlo.', { cause: error });
}

export async function getAcademyLevels(): Promise<AcademyLevel[]> {
  const [levels, lessons] = await Promise.all([
    supabase.from('academy_levels').select('id, level_number, title').order('level_number'),
    supabase.from('lessons').select('id, level_id, title, order_index').order('order_index'),
  ]);
  if (levels.error || lessons.error) throw new Error('No se pudo cargar la ruta de aprendizaje. Inténtalo de nuevo.');
  if (!levels.data.some((level) => level.level_number === 1)) throw new Error('El Nivel 1 todavía no está disponible.');
  return ACADEMY_CATALOG.map((preview) => {
    const level = levels.data.find((item) => item.level_number === preview.number);
    const levelLessons: LessonSummary[] = [];
    for (const lesson of lessons.data) {
      if (!level || lesson.level_id !== level.id) continue;
      if (!lesson.id || !lesson.level_id || !lesson.title || lesson.order_index === null) {
        throw new Error('Hay una lección incompleta en el catálogo.');
      }
      levelLessons.push({ id: lesson.id, level_id: lesson.level_id, title: lesson.title, order_index: lesson.order_index });
    }
    return {
      ...preview, id: level?.id ?? null, title: level?.title ?? preview.title,
      lessons: levelLessons, lessonCount: level ? levelLessons.length : 3, accessible: !!level,
    };
  });
}

export async function getUserProgress(): Promise<UserAcademyProgress[]> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  const { data, error } = await supabase.from('user_academy_progress').select('*').eq('user_id', auth.user.id);
  if (error) throw new Error('No se pudo cargar tu progreso. Inténtalo de nuevo.', { cause: error });
  return data;
}

export async function getLessonContent(lessonId: string): Promise<LessonContent> {
  const { data, error } = await supabase.from('lessons').select('content_json').eq('id', lessonId).single();
  if (error) throw new Error('No se pudo abrir la lección. Comprueba tu conexión y el acceso de tu plan.', { cause: error });
  return parseLessonContent(data.content_json);
}

export async function getLessonQuiz(lessonId: string): Promise<LessonQuiz> {
  const { data, error } = await supabase.from('quizzes').select('lesson_id, questions, passing_score').eq('lesson_id', lessonId).single();
  if (error) throw new Error('No se pudo cargar el cuestionario.', { cause: error });
  return { lessonId: data.lesson_id, passingScore: data.passing_score, questions: parseQuizQuestions(data.questions) };
}

export async function submitQuiz(lessonId: string, answers: number[]): Promise<QuizResult> {
  const { data, error } = await supabase.rpc('submit_academy_quiz', { p_lesson_id: lessonId, p_answers: answers });
  if (error) throw academyError(error);
  const result = data?.[0];
  if (!result) throw new Error('No se recibió el resultado del cuestionario. Reinténtalo.');
  return result;
}

export async function completeLesson(lessonId: string, quizScore?: number): Promise<UserAcademyProgress> {
  // El argumento opcional es informativo: la RPC solo acepta el ID y usa la nota del servidor.
  if (quizScore !== undefined && (!Number.isFinite(quizScore) || quizScore < 0 || quizScore > 100)) {
    throw new Error('La nota del cuestionario no es válida.');
  }
  const { data, error } = await supabase.rpc('complete_academy_lesson', { p_lesson_id: lessonId });
  if (error) throw academyError(error);
  const progress = data?.[0];
  if (!progress) throw new Error('No se pudo confirmar la finalización de la lección.');
  return progress;
}
