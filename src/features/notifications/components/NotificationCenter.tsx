import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Bell, Check, LoaderCircle, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { getAssets } from '../../trading/services/tradingService';
import type { Asset } from '../../trading/services/tradingService';
import { formatPrice } from '../../trading/utils/market';
import { createPriceAlert, deletePriceAlert, getPriceAlerts, markPriceAlertRead } from '../services/notificationService';
import type { AlertDirection, PriceAlert } from '../services/notificationService';

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState('');
  const [direction, setDirection] = useState<AlertDirection>('above');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const version = useRef(0);
  const actionPending = useRef(false);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    try { const next = await getPriceAlerts(); if (current === version.current) { setAlerts(next); setError(null); } }
    catch (failure) { if (current === version.current) setError(failure instanceof Error ? failure.message : 'No se pudieron consultar las alertas.'); }
    finally { if (current === version.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const requestVersion = version;
    queueMicrotask(() => { if (!cancelled) void load(); });
    const refresh = () => { if (document.visibilityState === 'visible' && !actionPending.current) void load(); };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; requestVersion.current++; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getAssets().then((next) => { if (!cancelled) { setAssets(next); setAssetId((previous) => next.some((a) => a.id === previous) ? previous : next[0]?.id ?? ''); } })
      .catch(() => { if (!cancelled) setError('No se pudo cargar el catálogo para crear alertas. Cierra y vuelve a abrir el panel.'); });
    return () => { cancelled = true; };
  }, [open]);
  async function act(operation: () => Promise<void>, success: string) {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(true); setError(null); setNotice(null);
    try { await operation(); setNotice(success); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar la alerta.'); }
    finally { actionPending.current = false; setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assetId) return;
    void act(async () => { await createPriceAlert(assetId, direction, price); setPrice(''); }, 'Alerta guardada.');
  }
  const unread = alerts.filter((alert) => alert.status === 'triggered' && !alert.read_at).length;
  const selected = assets.find((asset) => asset.id === assetId);
  return <>
    <button type="button" onClick={() => { setOpen(true); void load(); }} aria-label={`Notificaciones, ${unread} sin leer`} aria-haspopup="dialog"
      className="relative rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-zinc-300 hover:text-white">
      <Bell className="size-4" aria-hidden="true" />{unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-emerald-400 px-1 text-center text-[10px] font-bold text-zinc-950">{unread > 99 ? '99+' : unread}</span>}
      {error && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-400" aria-label="Error al consultar notificaciones" />}
    </button>
    {open && <Modal title="Notificaciones y alertas" onClose={() => setOpen(false)}>
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="font-semibold">Nueva alerta de precio</h3><p className="text-xs leading-5 text-zinc-400">Te avisaremos aquí cuando el precio de compra alcance tu condición. Se comprueba al actualizarse las cotizaciones, aunque hayas cerrado la aplicación.</p>
        <label className="block text-xs text-zinc-400">Activo<select value={assetId} onChange={(event) => setAssetId(event.target.value)} disabled={busy || assets.length === 0} required className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100"><option value="" disabled>Selecciona un activo</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.ticker} · {asset.name}</option>)}</select></label>
        {selected && <p className="text-xs text-zinc-500">Último precio: {formatPrice(selected.current_price, selected.currency)}</p>}
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-zinc-400">Condición<select value={direction} onChange={(event) => setDirection(event.target.value as AlertDirection)} disabled={busy} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100"><option value="above">Igual o por encima</option><option value="below">Igual o por debajo</option></select></label><label className="text-xs text-zinc-400">Precio objetivo<input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" required disabled={busy} placeholder="100.00" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100" /></label></div>
        <button type="submit" disabled={busy || !assetId || !price.trim()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{busy && <LoaderCircle className="size-4 animate-spin" />}Crear alerta</button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error} <button type="button" onClick={() => void load()} className="underline">Reintentar alertas</button></p>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
      <div className="mt-6 flex items-center justify-between"><h3 className="font-semibold">Tus alertas</h3><span className="text-xs text-zinc-500">{alerts.length}/100</span></div>
      {loading && alerts.length === 0 ? <p role="status" className="py-8 text-sm text-zinc-400">Cargando alertas…</p> : alerts.length === 0 ? <p className="py-8 text-sm text-zinc-500">No tienes alertas. Crea la primera para seguir un precio.</p> : <ul className="mt-3 space-y-3">{alerts.map((alert) => <li key={alert.id} className={`rounded-xl border p-4 ${alert.status === 'triggered' && !alert.read_at ? 'border-emerald-400/25 bg-emerald-400/5' : 'border-zinc-800'}`}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{alert.asset?.ticker ?? 'Activo'} <span className="ml-1 text-xs font-normal text-zinc-500">{alert.status === 'active' ? 'Activa' : alert.read_at ? 'Leída' : 'Precio alcanzado'}</span></p><p className="mt-1 text-xs text-zinc-400">{alert.direction === 'above' ? '≥' : '≤'} {formatPrice(alert.target_price, alert.asset?.currency)}</p></div><button type="button" aria-label={`Eliminar alerta de ${alert.asset?.ticker ?? 'activo'}`} disabled={busy} onClick={() => void act(() => deletePriceAlert(alert.id), 'Alerta eliminada.')} className="rounded p-1 text-zinc-500 hover:text-rose-300"><Trash2 className="size-4" /></button></div>
        {alert.triggered_at && <p className="mt-2 text-xs text-emerald-300">Detectado a {formatPrice(alert.triggered_price, alert.asset?.currency)} · {new Date(alert.triggered_at).toLocaleString('es-ES')}</p>}
        {alert.status === 'triggered' && !alert.read_at && <button type="button" disabled={busy} onClick={() => void act(() => markPriceAlertRead(alert.id), 'Notificación marcada como leída.')} className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-300"><Check className="size-3" />Marcar como leída</button>}
      </li>)}</ul>}
    </Modal>}
  </>;
}
