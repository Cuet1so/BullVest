import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, LoaderCircle } from 'lucide-react';
import type { Asset, OrderType } from '../services/tradingService';
import { canQuoteTrade, formatPrice, getOrderPrice } from '../utils/market';

interface OrderFormProps {
  asset: Asset | null;
  availableBalance: number;
  heldQuantity: number;
  orderType: OrderType;
  onOrderTypeChange: (side: OrderType) => void;
  disabled?: boolean;
  onExecute: (orderType: OrderType, quantity: string, requestId: string) => Promise<void>;
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// NUMERIC(20,8): máximo 12 dígitos enteros y 8 decimales.
const DECIMAL_QUANTITY = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;

export function OrderForm({
  asset,
  availableBalance,
  heldQuantity,
  orderType,
  onOrderTypeChange,
  disabled = false,
  onExecute,
}: OrderFormProps) {
  const [quantity, setQuantity] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  // Mantener el mismo UUID si falla la red y el usuario reintenta la MISMA orden.
  const requestIdRef = useRef<string | null>(null);

  const price = getOrderPrice(asset, orderType);
  const quantityNumber = Number(quantity);
  const validQuantity =
    DECIMAL_QUANTITY.test(quantity) &&
    Number.isFinite(quantityNumber) && quantityNumber > 0;
  const estimatedTotal = validQuantity && price !== null ? Math.round(quantityNumber * price * 100) / 100 : 0;
  const sufficientBalance = orderType === 'SELL' || estimatedTotal <= availableBalance;
  const sufficientQuantity = orderType === 'BUY' || quantityNumber <= heldQuantity;
  const lastQuoteMs = asset?.price_updated_at
    ? Date.parse(asset.price_updated_at)
    : Number.NaN;
  const quoteAvailable = asset !== null && canQuoteTrade(asset, orderType, now);
  const canSubmit =
    !!asset && !disabled && !submitting && validQuantity &&
    quoteAvailable && estimatedTotal >= 0.01 &&
    sufficientBalance && sufficientQuantity;

  function changeOrderType(next: OrderType) {
    if (submitting) return;
    onOrderTypeChange(next);
    requestIdRef.current = null;
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function changeQuantity(next: string) {
    if (submitting) return;
    setQuantity(next);
    requestIdRef.current = null;
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !asset) return;

    const currentTime = Date.now();
    const quoteAge = currentTime - lastQuoteMs;

    if (quoteAge < -5_000 || quoteAge > 120_000) {
      setNow(currentTime);
      setErrorMessage('Este activo no tiene una cotización operable y reciente.');
      setSuccessMessage(null);
      return;
    }

    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await onExecute(orderType, quantity, requestId);
      requestIdRef.current = null;
      setSuccessMessage(`${orderType === 'BUY' ? 'Compra' : 'Venta'} confirmada.`);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Error inesperado al operar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6" aria-label="Formulario de operaciones">
      <div className="mb-5 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Nueva orden</h2>
        {asset && <span className="text-xs font-semibold text-zinc-400">{asset.ticker} · {asset.currency}</span>}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2" role="group" aria-label="Tipo de orden">
        <button type="button" disabled={disabled || submitting} onClick={() => changeOrderType('BUY')}
          aria-pressed={orderType === 'BUY'}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${orderType === 'BUY' ? 'bg-emerald-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
          <ArrowDownLeft className="size-4" aria-hidden="true" /> Comprar
        </button>
        <button type="button" disabled={disabled || submitting} onClick={() => changeOrderType('SELL')}
          aria-pressed={orderType === 'SELL'}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${orderType === 'SELL' ? 'bg-rose-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
          <ArrowUpRight className="size-4" aria-hidden="true" /> Vender
        </button>
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <label htmlFor="bullvest-order-quantity" className="mb-2 block text-sm text-zinc-300">Cantidad de unidades</label>
          <input id="bullvest-order-quantity" type="text" inputMode="decimal" required disabled={disabled || submitting || !asset}
            value={quantity} onChange={(event) => changeQuantity(event.target.value)} placeholder="1.00000000"
            aria-invalid={!validQuantity}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-50" />
          {!validQuantity && <p className="mt-2 text-xs text-amber-300">Introduce una cantidad positiva con hasta 8 decimales.</p>}
        </div>
        <dl className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-zinc-400">Precio de {orderType === 'BUY' ? 'compra' : 'venta'}</dt><dd className="font-medium tabular-nums text-zinc-100">{formatPrice(price, asset?.currency)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-zinc-400">Saldo disponible</dt><dd className="font-medium tabular-nums text-zinc-100">{usd.format(availableBalance)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-zinc-400">Unidades en cartera</dt><dd className="font-medium tabular-nums text-zinc-100">{heldQuantity.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}</dd></div>
          <div className="border-t border-zinc-800 pt-3 flex justify-between gap-2"><dt className="font-medium text-zinc-200">Importe estimado</dt><dd className="font-bold tabular-nums text-emerald-300">{usd.format(estimatedTotal)}</dd></div>
        </dl>
        {!quoteAvailable && asset && <p className="text-xs text-amber-300">Este activo no tiene una cotización operable y reciente.</p>}
        {!sufficientBalance && <p className="text-xs text-red-300">Saldo insuficiente para comprar esa cantidad.</p>}
        {!sufficientQuantity && <p className="text-xs text-red-300">No tienes suficientes unidades para vender.</p>}
        {errorMessage && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{errorMessage}</p>}
        {successMessage && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{successMessage}</p>}
        <button type="submit" disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
          {submitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {submitting ? 'Procesando orden…' : orderType === 'BUY' ? 'Confirmar compra' : 'Confirmar venta'}
        </button>
      </form>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">El precio y el importe son orientativos hasta la confirmación de la operación. Todo el capital es ficticio.</p>
    </section>
  );
}
