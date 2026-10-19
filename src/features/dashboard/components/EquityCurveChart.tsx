import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EquityPoint } from '../utils/performance';

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
export function EquityCurveChart({ points }: { points: EquityPoint[] }) {
  const gradient = useId().replaceAll(':', '');
  if (!points.length) return <p className="py-16 text-center text-sm text-zinc-400">Aún no hay valoraciones registradas.</p>;
  return (
    <div className="h-72 min-w-0" role="img" aria-label={`Curva diaria del patrimonio a Ask: ${points.length} valoraciones. Último patrimonio ${money.format(points.at(-1)!.equity)}.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={points} margin={{ top: 20, right: 15, left: 4, bottom: 8 }} accessibilityLayer>
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.35} /><stop offset="100%" stopColor="#34d399" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={25} tickFormatter={(value: string) => value.slice(5).split('-').reverse().join('/')} />
          <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} tickLine={false} axisLine={false} width={65} domain={['auto', 'auto']} tickFormatter={(value: number) => new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 2 }).format(value)} />
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, color: '#fafafa' }} labelFormatter={(value) => `Fecha UTC: ${String(value)}`} formatter={(value) => [money.format(Number(value)), 'Patrimonio (Ask)']} />
          <Area type="linear" dataKey="equity" stroke="#34d399" strokeWidth={2} fill={`url(#${gradient})`} dot={points.length === 1 ? { r: 4 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
