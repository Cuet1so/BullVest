import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RecentTransaction } from '../services/dashboardService';
import { money, quantity, transactionDate } from '../utils/formatters';

export function RecentTransactionsWidget({ transactions }: { transactions: RecentTransaction[] }) {
  return (
    <section aria-labelledby="recent-transactions-title" className="h-full min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="recent-transactions-title" className="text-lg font-semibold">Últimas operaciones</h2><p className="mt-1 text-xs text-zinc-400">Tus 5 movimientos más recientes.</p></div>
        <Link to="/simulador" className="text-xs font-medium text-emerald-300 hover:underline">Ir al simulador →</Link>
      </div>
      {transactions.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <span className="rounded-2xl border border-zinc-700 bg-zinc-800/50 p-4"><ReceiptText className="size-6 text-zinc-400" aria-hidden="true" /></span>
          <p className="mt-4 font-medium">Tu primera operación empieza aquí</p>
          <p className="mt-2 max-w-xs text-sm text-zinc-400">Cuando compres o vendas, podrás consultar los detalles en este panel.</p>
          <Link to="/simulador" className="mt-5 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300">Explorar activos</Link>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-150 text-left text-sm">
            <caption className="sr-only">Últimas cinco operaciones, con precios e importes en dólares estadounidenses</caption>
            <thead className="border-y border-zinc-800 text-xs text-zinc-400"><tr>
              <th scope="col" className="py-3 pr-3 font-medium">Fecha</th><th scope="col" className="py-3 pr-3 font-medium">Tipo</th><th scope="col" className="py-3 pr-3 font-medium">Activo</th><th scope="col" className="py-3 pl-3 text-right font-medium">Cantidad</th><th scope="col" className="py-3 pl-3 text-right font-medium">Precio ejecutado</th><th scope="col" className="py-3 pl-3 text-right font-medium">Total</th><th scope="col" className="py-3 pl-3 text-right font-medium">P/L realizado</th>
            </tr></thead>
            <tbody>{transactions.map((transaction) => {
              const buy = transaction.transaction_type === 'BUY';
              return <tr key={transaction.id} className="border-b border-zinc-800/70 last:border-0">
                <td className="py-4 pr-3 text-xs text-zinc-400"><time dateTime={transaction.executed_at}>{transactionDate.format(new Date(transaction.executed_at))}</time></td>
                <td className="py-4 pr-3"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${buy ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{buy ? <ArrowDownLeft className="size-3" aria-hidden="true" /> : <ArrowUpRight className="size-3" aria-hidden="true" />}{transaction.transaction_type}</span></td>
                <td className="py-4 pr-3"><span className="block font-semibold">{transaction.asset?.ticker ?? 'No disponible'}</span><span className="mt-1 block max-w-36 truncate text-xs text-zinc-500" title={transaction.asset?.name}>{transaction.asset?.name ?? 'Activo no disponible'}</span></td>
                <td className="py-4 pl-3 text-right tabular-nums">{quantity.format(transaction.quantity)}</td>
                <td className="py-4 pl-3 text-right tabular-nums">{money.format(transaction.execution_price)}<span className="block text-xs text-zinc-500">{buy ? 'Ask' : 'Bid'}</span></td>
                <td className="py-4 pl-3 text-right font-semibold tabular-nums">{money.format(transaction.total_value)}</td>
                <td className="py-4 pl-3 text-right tabular-nums">{!buy && transaction.realized_pnl != null ? money.format(transaction.realized_pnl) : '?'}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
