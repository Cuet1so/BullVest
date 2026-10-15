import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, LoaderCircle, RotateCcw } from 'lucide-react';
import { completeLesson, submitQuiz } from '../services/academyService';
import type { LessonQuiz, QuizResult } from '../services/academyService';

export function QuizModule({ quiz, onProgressChanged, onReadAgain }: {
  quiz: LessonQuiz;
  onProgressChanged: () => Promise<void>;
  onReadAgain: () => void;
}) {
  const [answers, setAnswers] = useState<number[]>(() => quiz.questions.map(() => -1));
  const [result, setResult] = useState<QuizResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = answers.filter((answer) => answer >= 0).length;

  async function evaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || answered !== quiz.questions.length) return;
    setBusy(true);
    setError(null);
    try {
      const evaluation = result ?? await submitQuiz(quiz.lessonId, answers);
      setResult(evaluation);
      if (evaluation.passed) {
        await completeLesson(quiz.lessonId, evaluation.score);
        setSaved(true);
      }
      await onProgressChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo corregir el test.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void evaluate(event)} className="space-y-6">
      <div><h3 className="text-xl font-semibold">Pon a prueba lo aprendido</h3><p className="mt-2 text-sm text-zinc-400">Necesitas al menos un {quiz.passingScore} % para completar la lección. Se conserva tu mejor nota.</p></div>
      {quiz.questions.map((question, index) => (
        <fieldset key={index} disabled={busy || result !== null} className="rounded-xl border border-zinc-800 p-4">
          <legend className="px-1 text-sm font-semibold leading-relaxed">{index + 1}. {question.prompt}</legend>
          <div className="mt-2 space-y-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-relaxed has-disabled:cursor-default ${answers[index] === optionIndex ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-100' : 'border-zinc-800 text-zinc-300 hover:bg-zinc-900'}`}>
            <input type="radio" name={`question-${index}`} value={optionIndex} checked={answers[index] === optionIndex} onChange={() => setAnswers((previous) => previous.map((answer, i) => i === index ? optionIndex : answer))} className="mt-1 shrink-0 accent-emerald-400" />{option}
          </label>)}</div>
        </fieldset>
      ))}
      {!result && <p className="text-xs text-zinc-400" aria-live="polite">{answered}/{quiz.questions.length} preguntas respondidas</p>}
      {result && <div role="status" className={`rounded-xl border p-4 ${result.passed ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>
        <p className="text-lg font-semibold">{result.passed ? 'Aprobado' : 'Todavía no has aprobado'} · {result.score} %</p>
        <p className="mt-1 text-sm">{result.correct_count} de {result.question_count} respuestas correctas.</p>
        <p className="mt-2 text-sm">{saved ? 'Lección completada. Tu progreso está guardado.' : result.passed ? 'Falta confirmar la finalización de la lección.' : 'Repasa la teoría y vuelve a intentarlo. Una lección ya completada no pierde su estado.'}</p>
      </div>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {!saved && (!result || result.passed) && <button type="submit" disabled={busy || answered !== quiz.questions.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">{busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{busy ? 'Guardando resultado…' : result ? 'Guardar progreso' : 'Corregir test'}</button>}
        {result && !result.passed && <button type="button" disabled={busy} onClick={() => { setResult(null); setError(null); }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950"><RotateCcw className="size-4" aria-hidden="true" />Reintentar test</button>}
        <button type="button" disabled={busy} onClick={onReadAgain} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">Volver a la teoría</button>
        {saved && <span className="inline-flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" aria-hidden="true" />Completada</span>}
      </div>
    </form>
  );
}
