import { ArrowUpRight, Landmark, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardSummary } from '../utils/dashboardSummary';
import { money, percentage } from '../utils/formatters';

export function NetWorthWidget({ summary }: { summary: DashboardSummary }) {
  const positive = summary.unrealizedPnl >= 0;
  return (
    <section aria-labelledby="net-worth-title" className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-linear-to-br from-emerald-950/70 via-zinc-900 to-zinc-900 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="net-worth-title" className="text-sm font-medium text-emerald-100/80">Patrimonio total</h2>
          <p className="mt-3 break-words text-4xl font-semibold tracking-tight text-white tabular-nums sm:text-5xl">{money.format(summary.netWorth)}</p>
          <p className="mt-2 text-xs text-zinc-400">Capital ficticio · Liquidez + valor de mercado</p>
        </div>
        <Link to="/simulador" className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-300/10 focus-visible:outline-2 focus-visible:outline-emerald-300">Operar <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
      </div>
      <dl className="mt-8 grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-2">
        <div><dt className="flex items-center gap-2 text-sm text-zinc-400"><Wallet className="size-4 text-emerald-300" aria-hidden="true" /> Dinero líquido</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money.format(summary.cashBalance)}</dd></div>
        <div><dt className="flex items-center gap-2 text-sm text-zinc-400"><Landmark className="size-4 text-sky-300" aria-hidden="true" /> Valor invertido</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money.format(summary.investedValue)}</dd></div>
      </dl>
      <div className="mt-6">
        <div className="mb-2 flex justify-between gap-3 text-xs text-zinc-400"><span>Liquidez disponible</span><span className="font-medium text-emerald-200">{percentage.format(summary.liquidityPercentage)} %</span></div>
        <div role="progressbar" aria-label="Porcentaje de liquidez" aria-valuenow={summary.liquidityPercentage} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-zinc-700"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${summary.liquidityPercentage}%` }} /></div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-sm">
        <span className="text-zinc-400">Rentabilidad de posiciones abiertas</span>
        <span className={`font-semibold tabular-nums ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>{positive ? '+' : ''}{money.format(summary.unrealizedPnl)}{summary.unrealizedPnlPercentage !== null && ` (${positive ? '+' : ''}${percentage.format(summary.unrealizedPnlPercentage)} %)`}</span>
      </div>
    </section>
  );
}
