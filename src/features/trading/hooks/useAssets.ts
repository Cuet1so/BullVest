import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { withTimeout } from '../../../lib/withTimeout';
import { getAssets } from '../services/tradingService';
import type { Asset } from '../services/tradingService';
import { appendQuotes } from '../utils/chartSeries';
import type { QuoteHistory } from '../utils/chartSeries';

function timestamp(asset: Asset): number {
  return Date.parse(asset.updated_at || asset.price_updated_at || '') || 0;
}

export function useAssets(userId: string | undefined) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [quoteHistory, setQuoteHistory] = useState<QuoteHistory>({});
  const [connection, setConnection] = useState<'connecting' | 'live' | 'fallback'>('connecting');
  const journal = useRef(new Map<string, { version: number; asset: Asset | null }>());
  const revision = useRef(0);
  const readVersion = useRef(0);
  const epoch = useRef(0);
  const readAssets = useCallback(async () => {
    const start = revision.current;
    const read = ++readVersion.current;
    const generation = epoch.current;
    const snapshot = await withTimeout(getAssets());
    const merged = new Map(snapshot.map((asset) => [asset.id, asset]));
    // Replay inserts, updates and deletes received while this HTTP snapshot was in flight.
    for (const [id, event] of journal.current) {
      if (event.version <= start) continue;
      if (event.asset) merged.set(id, event.asset); else merged.delete(id);
    }
    const result = [...merged.values()];
    if (generation === epoch.current && read === readVersion.current) {
      setAssets(result);
      setQuoteHistory((history) => appendQuotes(history, result));
    }
    return result;
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const lifecycle = epoch;
    epoch.current++;
    let syncVersion = 0;
    const channel = supabase.channel('public:assets')
      .on<Asset>('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, (event) => {
        if (!active) return;
        if (event.eventType === 'DELETE') {
          const id = event.old.id;
          if (!id) return;
          journal.current.set(id, { version: ++revision.current, asset: null });
          setAssets((current) => current.filter((asset) => asset.id !== id));
          setQuoteHistory((history) => {
            const next = { ...history };
            delete next[id];
            return next;
          });
          return;
        }
        // BullVest stores Ask as current_price and Bid as sell_price.
        const next = event.new;
        if (!next.id || typeof next.current_price !== 'number' || !Number.isFinite(next.current_price)) return;
        const previousEvent = journal.current.get(next.id)?.asset;
        if (previousEvent && timestamp(previousEvent) > timestamp(next)) return;
        journal.current.set(next.id, { version: ++revision.current, asset: next });
        setQuoteHistory((history) => appendQuotes(history, [next]));
        setAssets((current) => {
          const previous = current.find((asset) => asset.id === next.id);
          if (previous && timestamp(previous) > timestamp(next)) return current;
          return previous ? current.map((asset) => asset.id === next.id ? { ...asset, ...next } : asset) : [...current, next];
        });
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          const version = ++syncVersion;
          // Read again after subscribing/reconnecting to recover missed events.
          void (async () => {
            try {
              await readAssets();
              if (!active || version !== syncVersion) return;
              setConnection('live');
            } catch { if (active && version === syncVersion) setConnection('fallback'); }
          })();
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          syncVersion++;
          setConnection('fallback');
        }
      });
    return () => {
      active = false;
      lifecycle.current++;
      syncVersion++;
      void supabase.removeChannel(channel).catch(() => { /* SDK closes the underlying socket on teardown. */ });
    };
  }, [userId, readAssets]);

  return { assets, readAssets, connection, quoteHistory };
}
