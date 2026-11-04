import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database.types';

export type AcademyModuleV2 = Database['public']['Tables']['academy_modules']['Row'];
export type AcademyLessonV2 = Database['public']['Tables']['academy_lessons_v2']['Row'];
export type AcademyExerciseV2 = Database['public']['Tables']['academy_exercises_v2']['Row'];
export type AcademyProgressV2 = Database['public']['Tables']['academy_user_progress_v2']['Row'];
export type ExerciseEvaluationV2 = Database['public']['Functions']['submit_academy_exercise_v2']['Returns'][number];

export interface AcademyV2State {
  modules: AcademyModuleV2[];
  lessons: AcademyLessonV2[];
  progress: AcademyProgressV2[];
}

function fail(message: string, cause: unknown): never {
  throw new Error(message, { cause });
}

export async function getAcademyV2State(): Promise<AcademyV2State> {
  const [modules, lessons, progress] = await Promise.all([
    supabase.from('academy_modules').select('*').order('level_number').order('order_index'),
    supabase.from('academy_lessons_v2').select('*').eq('published', true).order('order_index'),
    supabase.from('academy_user_progress_v2').select('*'),
  ]);

  if (modules.error) fail('No se pudo cargar el índice de módulos.', modules.error);
  if (lessons.error) fail('No se pudieron cargar las lecciones disponibles.', lessons.error);
  if (progress.error) fail('No se pudo cargar el progreso.', progress.error);

  return {
    modules: modules.data,
    lessons: lessons.data,
    progress: progress.data,
  };
}

export async function getAcademyV2Lesson(moduleSlug: string, lessonSlug: string): Promise<{
  module: AcademyModuleV2;
  lesson: AcademyLessonV2 | null;
  exercises: AcademyExerciseV2[];
}> {
  const moduleResult = await supabase.from('academy_modules')
    .select('*').eq('slug', moduleSlug).single();

  if (moduleResult.error || !moduleResult.data) {
    return fail('El módulo no está disponible.', moduleResult.error);
  }

  const lessonResult = await supabase.from('academy_lessons_v2')
    .select('*')
    .eq('module_id', moduleResult.data.id)
    .eq('slug', lessonSlug)
    .eq('published', true)
    .maybeSingle();

  if (lessonResult.error) fail('No se pudo consultar esta lección.', lessonResult.error);

  if (!lessonResult.data) {
    return { module: moduleResult.data, lesson: null, exercises: [] };
  }

  const exerciseResult = await supabase.from('academy_exercises_v2')
    .select('*').eq('lesson_id', lessonResult.data.id).eq('published', true)
    .order('order_index');

  if (exerciseResult.error) fail('No se pudieron cargar los ejercicios.', exerciseResult.error);

  return {
    module: moduleResult.data,
    lesson: lessonResult.data,
    exercises: exerciseResult.data,
  };
}

export async function getAcademyV2Progress(): Promise<AcademyProgressV2[]> {
  const { data, error } = await supabase.from('academy_user_progress_v2').select('*');
  if (error) return fail('No se pudo actualizar el progreso.', error);
  return data;
}

export async function submitAcademyV2Exercise(
  exerciseId: string,
  answer: string,
): Promise<ExerciseEvaluationV2> {
  const { data, error } = await supabase.rpc('submit_academy_exercise_v2', {
    p_exercise_id: exerciseId,
    p_answer: answer,
  });

  if (error) {
    const translations: Record<string, string> = {
      UNAUTHORIZED: 'Debes iniciar sesión para enviar respuestas.',
      ACADEMY_REQUIRES_PRO: 'Esta lección requiere la suscripción Pro.',
      INVALID_ANSWER: 'La respuesta es obligatoria y debe tener como máximo 200 caracteres.',
      INVALID_NUMERIC_ANSWER: 'Introduce un número válido, usando el punto decimal.',
      EXERCISE_NOT_FOUND: 'El ejercicio ya no está disponible.',
      EXERCISE_NOT_READY: 'Este ejercicio todavía no está preparado.',
    };
    return fail(translations[error.message] ?? 'No se pudo corregir el ejercicio.', error);
  }

  if (!data?.[0]) {
    return fail('No se recibió una evaluación del servidor.', null);
  }
  return data[0];
}
