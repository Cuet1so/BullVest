import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, CircleX, LoaderCircle, TrendingUp } from 'lucide-react';
import type { AcademyExerciseV2, ExerciseEvaluationV2 } from './academyV2Service';
import { submitAcademyV2Exercise } from './academyV2Service';
import { AcademyMarkdown } from './AcademyMarkdown';

type Choice = { id: string; label: string };
type Candle = { timestamp: string; open: number; high: number; low: number; close: number };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function parseChoices(payload: unknown): Choice[] {
  const raw = object(payload)?.options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Choice[] => {
    const entry = object(item);
    return entry && typeof entry.id === 'string' && typeof entry.label === 'string'
      ? [{ id: entry.id, label: entry.label }] : [];
  });
}

function parseCandles(payload: unknown): Candle[] {
  const raw = object(payload)?.candles;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 80).flatMap((item): Candle[] => {
    const v = object(item);
    if (!v || typeof v.timestamp !== 'string') return [];
    const values = ['open', 'high', 'low', 'close'] as const;
    if (!values.every((key) => typeof v[key] === 'number' && Number.isFinite(v[key]))) return [];
    const open = v.open as number;
    const close = v.close as number;
    const low = v.low as number;
    const high = v.high as number;
    if (low > Math.min(open, close) || high < Math.max(open, close) || low >= high) return [];
    return [{ timestamp: v.timestamp, open, high, low, close }];
  });
}

function CandleChart({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) return (
    <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-500">
      El gráfico de este ejercicio todavía no está disponible.
    </p>
  );

  const top = Math.max(...candles.map((c) => c.high));
  const bottom = Math.min(...candles.map((c) => c.low));
  const spread = Math.max(top - bottom, 0.00001);
  const y = (value: number) => 18 + ((top - value) / spread) * 164;
  const candleWidth = Math.min(12, 720 / candles.length * 0.65);

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <svg aria-label="Gráfico de velas simulado" role="img" viewBox="0 0 800 200" className="w-full min-w-90">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="15" x2="785" y1={18 + i * 41} y2={18 + i * 41} stroke="#3f3f46" strokeDasharray="3 7" />
        ))}
        {candles.map((c, i) => {
          const x = 30 + (i + 0.5) * (740 / candles.length);
          const color = c.close >= c.open ? '#34d399' : '#fb7185';
          const start = y(Math.max(c.open, c.close));
          const height = Math.max(Math.abs(y(c.open) - y(c.close)), 1.5);
          return <g key={c.timestamp + i}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.5" />
            <rect x={x - candleWidth / 2} y={start} width={candleWidth} height={height} fill={color} rx="1" />
          </g>;
        })}
      </svg>
      <p className="mt-1 text-xs text-zinc-500">Serie didáctica ficticia. No representa cotizaciones reales.</p>
    </div>
  );
}

export function AcademyExercise({
  exercise,
  onProgressChanged,
}: {
  exercise: AcademyExerciseV2;
  onProgressChanged: (result: ExerciseEvaluationV2) => Promise<void>;
}) {
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<ExerciseEvaluationV2 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = object(exercise.payload);
  const choices = parseChoices(exercise.payload);
  const candles = exercise.kind === 'chart_analysis' ? parseCandles(exercise.payload) : [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitAcademyV2Exercise(exercise.id, answer.trim());
      setEvaluation(result);
      await onProgressChanged(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo evaluar la respuesta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}
      className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-300">
          <TrendingUp className="size-4" aria-hidden="true" />
          {exercise.kind === 'numeric' ? 'Cálculo financiero' : exercise.kind === 'chart_analysis' ? 'Análisis gráfico' : 'Cuestionario'}
        </span>
        <span className="text-xs text-zinc-500">{exercise.points} puntos</span>
      </div>
      <AcademyMarkdown content={exercise.prompt_markdown} />
      {exercise.kind === 'chart_analysis' && <CandleChart candles={candles} />}
      {exercise.kind === 'numeric' ? (
        <label className="block space-y-2 text-sm text-zinc-300">
          <span>Tu resultado {typeof payload?.unit === 'string' ? '(' + payload.unit + ')' : ''}</span>
          <input type="text" inputMode="decimal" value={answer}
            onChange={(event) => setAnswer(event.target.value.replace(',', '.'))}
            disabled={busy || evaluation?.correct === true} placeholder="Ej. 2.50"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-emerald-400 disabled:opacity-60" />
        </label>
      ) : (
        <fieldset disabled={busy || evaluation?.correct === true} className="space-y-2">
          <legend className="sr-only">Selecciona una respuesta</legend>
          {choices.map((choice) => <label key={choice.id}
            className={'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ' +
              (answer === choice.id ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200' : 'border-zinc-800 text-zinc-300 hover:border-zinc-600')}>
            <input type="radio" name={exercise.id} value={choice.id} checked={answer === choice.id}
              onChange={() => setAnswer(choice.id)} className="mt-0.5 accent-emerald-400" />
            {choice.label}
          </label>)}
        </fieldset>
      )}
      {evaluation && <div role="status" className={'rounded-lg border p-3 text-sm ' +
        (evaluation.correct ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200')}>
        <p className="flex items-center gap-2 font-semibold">
          {evaluation.correct ? <CheckCircle2 className="size-4" /> : <CircleX className="size-4" />}
          {evaluation.correct ? 'Respuesta correcta' : 'Respuesta incorrecta · puedes reintentar'}
        </p>
        {evaluation.explanation_markdown && <p className="mt-2 text-sm">{evaluation.explanation_markdown}</p>}
      </div>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <button type="submit" disabled={busy || !answer.trim() || evaluation?.correct === true}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        {busy ? 'Evaluando…' : evaluation?.correct ? 'Superado' : 'Comprobar respuesta'}
      </button>
    </form>
  );
}
