import { withSupabase } from '@supabase/server';
import type { Database } from '../../../src/types/database.types.ts';

type Asset = Pick<Database['public']['Tables']['assets']['Row'],
  'id' | 'current_price' | 'sell_price' | 'updated_at'>;

const BATCH_SIZE = 10;
const PAGE_SIZE = 500;
const MIN_PRICE = 0.00000001;
const roundPrice = (price: number) => Math.max(MIN_PRICE, Number(price.toFixed(8)));

// One tick per POST. A scheduler calls this endpoint repeatedly; no long-lived
// loop is kept inside an Edge worker. Only server secret keys may move prices.
export default {
  fetch: withSupabase({ auth: 'secret' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return Response.json({ code: 'METHOD_NOT_ALLOWED' }, {
        status: 405, headers: { Allow: 'POST, OPTIONS' },
      });
    }

    try {
      // Reservoir sampling gives every valid asset the same chance, including
      // assets beyond PostgREST's default row limit, without loading all rows.
      const selected: Asset[] = [];
      let seen = 0;
      let cursor: string | null = null;
      while (true) {
        let query = ctx.supabaseAdmin.from('assets')
          .select('id, current_price, sell_price, updated_at')
          .order('id').limit(PAGE_SIZE);
        if (cursor !== null) query = query.gt('id', cursor);
        const { data, error } = await query.abortSignal(AbortSignal.timeout(15_000));
        if (error) {
          console.error('market-ticker read failed:', error.code);
          return Response.json({ code: 'ASSET_READ_FAILED' }, { status: 500 });
        }

        const assets = (data ?? []) as Asset[];
        for (const asset of assets) {
          if (!Number.isFinite(asset.current_price) || asset.current_price <= 0) continue;
          seen += 1;
          if (selected.length < BATCH_SIZE) selected.push(asset);
          else {
            const index = Math.floor(Math.random() * seen);
            if (index < BATCH_SIZE) selected[index] = asset;
          }
        }
        if (assets.length < PAGE_SIZE) break;
        cursor = assets[assets.length - 1].id;
      }

      const results = await Promise.allSettled(selected.map(async (asset) => {
        // current_price is Ask in BullVest. Recover the mid before applying the
        // next move so the +0.1% Ask spread is not compounded on every tick.
        const hasBid = asset.sell_price !== null && Number.isFinite(asset.sell_price)
          && asset.sell_price > 0 && asset.sell_price <= asset.current_price;
        const mid = hasBid
          ? (asset.current_price + asset.sell_price!) / 2
          : asset.current_price / 1.001;
        const price = mid * (1 + (Math.random() * 2 - 1) * 0.003);
        const timestamp = new Date().toISOString();

        // Compare-and-swap: an overlapping tick/refresh must not overwrite a
        // newer quote with prices computed from this older snapshot.
        let update = ctx.supabaseAdmin.from('assets').update({
          current_price: roundPrice(price * 1.001),
          sell_price: roundPrice(price * 0.999),
          price_updated_at: timestamp,
          updated_at: timestamp,
          price_source: 'simulated',
          quote_is_delayed: false,
        }).eq('id', asset.id)
          .eq('updated_at', asset.updated_at)
          .eq('current_price', asset.current_price);
        update = asset.sell_price === null
          ? update.is('sell_price', null)
          : update.eq('sell_price', asset.sell_price);

        const { data, error } = await update.select('id')
          .abortSignal(AbortSignal.timeout(15_000));
        if (error) {
          console.error('market-ticker update failed:', error.code);
          throw new Error('ASSET_UPDATE_FAILED');
        }
        return data?.length ?? 0;
      }));

      const updatedCount = results.reduce((count, result) =>
        count + (result.status === 'fulfilled' ? result.value : 0), 0);
      const failedCount = results.filter((result) => result.status === 'rejected').length;
      return Response.json({
        code: failedCount ? 'TICK_PARTIALLY_FAILED' : 'TICK_COMPLETE',
        selected_count: selected.length,
        updated_count: updatedCount,
        skipped_count: selected.length - updatedCount - failedCount,
        failed_count: failedCount,
      }, { status: failedCount ? 500 : 200 });
    } catch {
      console.error('market-ticker request failed');
      return Response.json({ code: 'TICK_FAILED' }, { status: 500 });
    }
  }),
};
