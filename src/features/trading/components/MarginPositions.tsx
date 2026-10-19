import { useRef, useState } from 'react';
import type { MarginPosition } from '../services/marginService';
import type { Asset } from '../services/tradingService';
import { marginValue } from '../utils/margin';

export function MarginPositions({ positions, assets, disabled, onClose }: {
  positions: MarginPosition[]; assets: Asset[]; disabled: boolean; onClose: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  async function close(id: string) {
    if (busy.current || disabled) return;
    busy.current = true; setPending(id); setError(null);
    try { await onClose(id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo cerrar la posición.'); }
    finally { busy.current = false; setPending(null); }
  }
  return <section aria-label="Posiciones de margen" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
    <h2 className="text-lg font-semibold">Posiciones de margen</h2>
    <p className="mt-2 text-xs text-zinc-400">Margen aislado · Comisión 0 % · TP/SL evaluados cada minuto con cotizaciones recientes</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    {positions.length === 0 ? <p className="py-6 text-sm text-zinc-400">No hay posiciones de margen.</p> : <div tabIndex={0} role="region" aria-label="Historial de margen, desplazable" className="mt-4 max-h-96 overflow-auto"><table className="w-full min-w-190 text-left text-xs"><thead><tr>{['Activo / lado','Inversión','Exposición','TP / SL ($)','P/L','Estado','Acción'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{positions.map((position) => {
      const asset = assets.find((item) => item.id === position.asset_id);
      const pnl = position.closed_at ? position.realized_pnl : marginValue(position, asset?.current_price ?? null, asset?.sell_price ?? null)?.pnl;
      return <tr key={position.id} className="border-t border-zinc-800"><td className="p-3">{asset?.ticker ?? 'Activo'} · {position.side === 'BUY' ? 'Largo' : 'Corto'} x{position.multiplier}</td><td className="p-3">{position.investment.toFixed(2)} $</td><td className="p-3">{(position.investment * position.multiplier).toFixed(2)} $</td><td className="p-3">{position.take_profit_amount ?? '—'} / {position.stop_loss_amount ?? '—'}</td><td className={`p-3 tabular-nums ${pnl != null && pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pnl?.toFixed(2) ?? '—'} $</td><td className="p-3">{position.closed_at ? `Cerrada · ${position.close_reason}` : 'Abierta'}</td><td className="p-3">{!position.closed_at && <button type="button" disabled={disabled || pending !== null} onClick={() => void close(position.id)} className="rounded-lg border border-zinc-600 p-2 disabled:opacity-50">{pending === position.id ? 'Cerrando…' : 'Cerrar posición'}</button>}</td></tr>;
    })}</tbody></table></div>}
  </section>;
}
