import ticker from './index.ts';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const secret = 'sb_secret_ticker_test_fixture';
const timestamp = '2026-10-19T12:00:00.000Z';
const asset = (id: number) => ({
  id: String(id).padStart(8, '0'), current_price: 100.1,
  sell_price: 99.9, updated_at: timestamp,
});
const request = (key = secret, method = 'POST') => new Request('https://ticker.test', {
  method, headers: key ? { apikey: key } : {},
});

async function withApi(
  fetch: (...args: Parameters<typeof globalThis.fetch>) => Response | Promise<Response>,
  test: () => Promise<void>, random = () => 0.5,
) {
  const oldFetch = globalThis.fetch;
  const oldRandom = Math.random;
  const env = {
    SUPABASE_URL: 'https://ticker.test',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: secret }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_test_fixture' }),
  };
  const previous = Object.keys(env).map((key) => [key, Deno.env.get(key)] as const);
  try {
    for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
    globalThis.fetch = (...args) => Promise.resolve(fetch(...args));
    Math.random = random;
    await test();
  } finally {
    globalThis.fetch = oldFetch;
    Math.random = oldRandom;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test('ticker rejects public keys and non-POST calls before accessing assets', async () => {
  await withApi(() => { throw new Error('Unexpected database access'); }, async () => {
    for (const key of ['', 'sb_publishable_test_fixture', 'invalid']) {
      const response = await ticker.fetch(request(key));
      assert(response.status === 401, 'Unauthorized caller accepted');
      await response.text();
    }
    const response = await ticker.fetch(request(secret, 'GET'));
    assert(response.status === 405, 'GET must not move prices');
    await response.text();
  });
});

Deno.test('ticker samples beyond the first page and preserves zero-drift mid/spread', async () => {
  const writes = new Set<string>();
  let reads = 0;
  await withApi((input, init) => {
    const url = new URL(String(input));
    if (init?.method !== 'PATCH') {
      reads += 1;
      const start = Number(url.searchParams.get('id')?.slice(3) ?? -1) + 1;
      return Response.json(Array.from({ length: Math.min(500, 1001 - start) }, (_, i) => asset(start + i)));
    }
    const id = url.searchParams.get('id')!;
    assert(!writes.has(id), 'Duplicate asset in sample');
    writes.add(id);
    assert(url.searchParams.get('updated_at') === `eq.${timestamp}`, 'Missing concurrency guard');
    const body = JSON.parse(String(init.body));
    assert(body.current_price === 99.7997 && body.sell_price === 99.6003,
      'Minimum -0.3% move or spread is incorrect');
    assert(body.updated_at === body.price_updated_at && Date.now() - Date.parse(body.price_updated_at) < 5000,
      'Quote timestamp not refreshed');
    return Response.json([{ id }]);
  }, async () => {
    const response = await ticker.fetch(request());
    const result = await response.json();
    assert(response.status === 200 && result.updated_count === 10, 'Expected ten updated assets');
    assert(reads === 3 && writes.has('eq.00001000'), 'Catalog after 1000 rows was excluded');
  }, () => 0);
});

Deno.test('zero move does not compound Ask, empty catalogs and conflicts are handled', async () => {
  let empty = false;
  await withApi((_input, init) => {
    if (init?.method !== 'PATCH') return Response.json(empty ? [] : [asset(0)]);
    const body = JSON.parse(String(init.body));
    assert(body.current_price === 100.1 && body.sell_price === 99.9, 'Spread created upward drift');
    return Response.json([]); // A concurrent refresh won the conditional update.
  }, async () => {
    const response = await ticker.fetch(request());
    const result = await response.json();
    assert(result.updated_count === 0 && result.skipped_count === 1, 'Lost concurrency guard');
    empty = true;
    const next = await ticker.fetch(request());
    assert((await next.json()).selected_count === 0 && next.status === 200, 'Empty catalog failed');
  });
});

Deno.test('partial write failures are reported, never acknowledged as complete', async () => {
  let writes = 0;
  await withApi((_input, init) => {
    if (init?.method !== 'PATCH') return Response.json([asset(0), asset(1)]);
    writes += 1;
    return writes === 1 ? Response.json([{ id: '0' }])
      : Response.json({ code: '42501', message: 'Denied' }, { status: 403 });
  }, async () => {
    const response = await ticker.fetch(request());
    const result = await response.json();
    assert(response.status === 500 && result.updated_count === 1 && result.failed_count === 1,
      'Partial failure was hidden');
  });
});
