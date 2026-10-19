import { useRef, useState } from 'react';
import type { Asset, OrderType } from '../services/tradingService';
import type { MarginOrder } from '../services/marginService';
import { MULTIPLIERS, riskAmount } from '../utils/margin';
import { canQuoteTrade, spreadPercentage } from '../utils/market';
import { PriceTick } from './PriceTick';

export function MarginOrderForm({ asset, side, balance, disabled, onExecute, onSideChange }: {
  asset: Asset; side: OrderType; balance: number; disabled: boolean; onExecute: (order: MarginOrder) => Promise<void>; onSideChange: (side: OrderType) => void;
}) {
  const [investment, setInvestment] = useState('100');
  const [multiplier, setMultiplier] = useState(1);
  const [stop, setStop] = useState(false);
  const [profit, setProfit] = useState(false);
  const [sl, setSl] = useState('10');
  const [tp, setTp] = useState('20');
  const [slUnit, setSlUnit] = useState<'USD' | '%'>('%');
  const [tpUnit, setTpUnit] = useState<'USD' | '%'>('%');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const busy = useRef(false);
  const capital = Number(investment);
  const stopLoss = stop ? riskAmount(sl, slUnit, capital) : null;
  const takeProfit = profit ? riskAmount(tp, tpUnit, capital) : null;
  const spread = spreadPercentage(asset.current_price, asset.sell_price);
  const entry = side === 'BUY' ? asset.current_price : asset.sell_price;
  const spreadCost = entry && asset.sell_price ? (asset.current_price - asset.sell_price) * capital * multiplier / entry : Infinity;
  const valid = /^\d+(?:\.\d{1,2})?$/.test(investment) && capital >= 0.01 && capital <= Math.min(balance, 1_000_000_000)
    && (!stop || (stopLoss !== null && stopLoss > 0 && stopLoss <= capital)) && (!profit || (takeProfit !== null && takeProfit > 0))
    && spreadCost < (stopLoss ?? capital);
  async function submit() {
    if (busy.current || disabled || !valid) return;
    if (!canQuoteTrade(asset, 'BUY', Date.now()) || !canQuoteTrade(asset, 'SELL', Date.now())) { setError('Se necesita una cotización reciente con Ask y Bid válidos.'); return; }
    const parameters = { asset_id: asset.id, side, investment: capital, multiplier, stop_loss: stopLoss, take_profit: takeProfit };
    const key = JSON.stringify(parameters);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    busy.current = true; setPending(true); setError(null); setMessage(null);
    try {
      await onExecute({ ...parameters, request_id: request.current.id });
      request.current = null; setMessage('Posición de margen confirmada.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo confirmar la posición.'); }
    finally { busy.current = false; setPending(false); }
  }
  const input = 'mt-2 min-w-0 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm disabled:opacity-50';
  return <form aria-label="Orden de margen" className="space-y-4 p-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <h2 className="text-lg font-semibold">{side === 'BUY' ? 'Comprar · Largo' : 'Vender · Corto'} {asset.ticker}</h2>
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Dirección de margen">{(['BUY', 'SELL'] as const).map((value) => <button key={value} type="button" disabled={disabled || pending} aria-pressed={side === value} onClick={() => onSideChange(value)} className={`rounded-lg border p-3 text-xs ${side === value ? 'border-emerald-400 text-emerald-300' : 'border-zinc-700'}`}>{value === 'BUY' ? 'Largo (compra)' : 'Corto (venta)'}</button>)}</div>
    <div className="grid grid-cols-2 gap-2 text-xs"><div>Compra (Ask)<PriceTick price={asset.current_price} className="mt-2 block" /></div><div>Venta (Bid)<PriceTick price={asset.sell_price} className="mt-2 block" /></div></div>
    <p className="text-xs text-zinc-400">Spread: {spread === null ? 'No disponible' : `${spread.toFixed(4)} %`}</p>
    <fieldset disabled={disabled || pending} className="space-y-4 disabled:opacity-60">
      <label className="block text-sm">Inversión / margen ($)<input aria-label="Inversión / margen ($)" inputMode="decimal" value={investment} onChange={(event) => setInvestment(event.target.value)} className={input} /></label>
      <label className="block text-sm">Multiplicador<select aria-label="Multiplicador" value={multiplier} onChange={(event) => setMultiplier(Number(event.target.value))} className={input}>{MULTIPLIERS.map((m) => <option key={m} value={m}>x{m}</option>)}</select></label>
      <dl className="space-y-2 rounded-lg bg-zinc-950 p-3 text-sm"><div>Exposición efectiva: <strong>{Number.isFinite(capital) ? (capital * multiplier).toFixed(2) : '—'} $</strong></div><div>Margen reservado: <strong>{Number.isFinite(capital) ? capital.toFixed(2) : '—'} $</strong></div><div>Comisión: <strong>0,00 $ (0 %)</strong></div></dl>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} /> Stop Loss</label>
      {stop && <div className="flex gap-2"><input aria-label="Stop Loss importe" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} className={input} /><select aria-label="Stop Loss unidad" value={slUnit} onChange={(e) => setSlUnit(e.target.value as 'USD' | '%')} className={input}><option>USD</option><option>%</option></select></div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profit} onChange={(e) => setProfit(e.target.checked)} /> Take Profit</label>
      {profit && <div className="flex gap-2"><input aria-label="Take Profit importe" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} className={input} /><select aria-label="Take Profit unidad" value={tpUnit} onChange={(e) => setTpUnit(e.target.value as 'USD' | '%')} className={input}><option>USD</option><option>%</option></select></div>}
      <p className="text-xs leading-5 text-zinc-400">TP/SL son ganancias o pérdidas sobre la inversión inicial; el % se convierte a dólares al confirmar. El servidor evalúa salidas cada minuto con precios recientes. Puede haber deslizamiento. La pérdida máxima de esta simulación es el margen reservado.</p>
      {!valid && <p className="text-xs text-amber-300">Revisa el saldo y los importes. El Stop Loss no puede superar la inversión ni quedar por debajo del coste inicial del spread.</p>}
      <button disabled={!valid || disabled || pending} className="w-full rounded-xl bg-emerald-400 px-3 py-3 font-semibold text-zinc-950 disabled:opacity-40">{pending ? 'Confirmando…' : 'Confirmar posición de margen'}</button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
  </form>;
}
