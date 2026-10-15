export interface LessonContent {
  introduction: string;
  sections: { title: string; text: string }[];
  example: string;
  takeaway: string;
  source: { title: string; url: string };
}

export interface QuizQuestion {
  prompt: string;
  options: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('El contenido de la lección no es válido.');
  return value;
}

export function parseLessonContent(value: unknown): LessonContent {
  if (!isRecord(value) || !Array.isArray(value.sections) || value.sections.length === 0 || !isRecord(value.source)) {
    throw new Error('El contenido de la lección no está disponible.');
  }
  const url = new URL(text(value.source.url));
  if (url.protocol !== 'https:') throw new Error('La referencia de la lección no es válida.');
  return {
    introduction: text(value.introduction),
    sections: value.sections.map((section: unknown) => {
      if (!isRecord(section)) throw new Error('El contenido de la lección no es válido.');
      return { title: text(section.title), text: text(section.text) };
    }),
    example: text(value.example), takeaway: text(value.takeaway),
    source: { title: text(value.source.title), url: url.href },
  };
}

export function parseQuizQuestions(value: unknown): QuizQuestion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new Error('El cuestionario no está disponible.');
  }
  return value.map((question: unknown) => {
    if (!isRecord(question) || !Array.isArray(question.options) || question.options.length < 2) {
      throw new Error('El cuestionario no es válido.');
    }
    return { prompt: text(question.prompt), options: question.options.map(text) };
  });
}

// Solo el índice editorial público. La teoría y los tests se leen bajo RLS.
export const ACADEMY_CATALOG = [
  { number: 1, title: 'Análisis de Estados Financieros', author: 'John J. Wild', description: 'Lee el balance, interpreta los resultados y sigue el flujo de caja.' },
  { number: 2, title: 'Screening Cuantitativo', author: 'Joel Greenblatt', description: 'Filtra candidatos con la Fórmula Mágica, Earnings Yield y ROCE.' },
  { number: 3, title: 'Análisis Cualitativo y Moats', author: 'Philip Fisher', description: 'Investiga ventajas competitivas, directiva y margen de seguridad.' },
  { number: 4, title: 'Análisis Técnico y Tendencias', author: 'John J. Murphy', description: 'Interpreta soportes, resistencias, medias móviles y patrones.' },
  { number: 5, title: 'Timing de Mercado y Gestión de Riesgo', author: 'Stan Weinstein', description: 'Reconoce las fases del mercado y aprende a dimensionar el riesgo.' },
] as const;
