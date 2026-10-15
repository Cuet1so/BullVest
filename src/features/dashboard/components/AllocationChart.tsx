import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DashboardSummary } from '../utils/dashboardSummary';
import { money, percentage } from '../utils/formatters';

const COLORS = ['#38bdf8', '#a78bfa', '#fbbf24', '#fb7185', '#2dd4bf', '#f97316'];

export function AllocationChart({ summary }: { summary: DashboardSummary }) {
  const data = [
    { id: 'cash', name: 'Liquidez', value: summary.cashBalance, share: summary.liquidityPercentage, fill: '#34d399' },
    ...summary.holdings.map((holding, index) => ({
      id: holding.assetId, name: holding.ticker, value: holding.marketValue,
      share: holding.percentage, fill: COLORS[index % COLORS.length],
    })),
  ].filter((item) => item.value > 0 || summary.holdings.length === 0);
  // Con patrimonio cero se dibuja un anillo de liquidez; los importes siguen a cero.
  const chartData = data.map((item) => ({ ...item, chartValue: summary.netWorth > 0 ? item.value : 1 }));
  return (
    <section aria-labelledby="allocation-title" className="h-full min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
      <h2 id="allocation-title" className="text-lg font-semibold">Distribución del patrimonio</h2>
      <p className="mt-1 text-xs text-zinc-400">Peso de cada activo y de tu liquidez.</p>
      <div className="relative mx-auto mt-4 h-56 w-full max-w-xs" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie data={chartData} dataKey="chartValue" nameKey="name" innerRadius="68%" outerRadius="90%" paddingAngle={data.length > 1 ? 3 : 0} stroke="none" isAnimationActive={false} />
            <Tooltip content={({ active, payload }) => {
              const item = data.find((entry) => entry.name === payload?.[0]?.name);
              return active && item ? <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white shadow-xl"><p className="font-semibold">{item.name}</p><p className="mt-1">{money.format(item.value)} · {percentage.format(item.share)} %</p></div> : null;
            }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-semibold tabular-nums">{summary.holdings.length === 0 ? '100 %' : summary.holdings.length}</span><span className="mt-1 text-xs text-zinc-400">{summary.holdings.length === 0 ? 'Liquidez' : summary.holdings.length === 1 ? 'activo en cartera' : 'activos en cartera'}</span></div>
      </div>
      <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto" aria-label="Distribución por activo">
        {data.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} aria-hidden="true" />{item.name}</span><span className="text-right"><span className="font-medium tabular-nums">{percentage.format(item.share)} %</span><span className="ml-2 text-xs text-zinc-400">{money.format(item.value)}</span></span></li>)}
      </ul>
      {summary.holdings.length === 0 && <p className="mt-5 text-xs leading-relaxed text-zinc-400">Tu cartera está lista para empezar. Encuentra tu primera inversión en el simulador.</p>}
    </section>
  );
}
