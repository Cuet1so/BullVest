import { authenticatedAccount, billingHandler, grantsPro, isBullVestSubscription, requiredEnv, Stripe, validateBillingEnvironment } from './billing.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function subscription(status: string, invoice: object | null = null): Stripe.Subscription {
  return { status, latest_invoice: invoice, metadata: { supabase_user_id: 'user-a' },
    items: { data: [{ price: { id: 'price_bullvest' } }] } } as unknown as Stripe.Subscription;
}

Deno.test('billing errors correlate safe browser responses with useful server diagnostics', async () => {
  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    const handler = billingHandler(() => Promise.reject(new Stripe.errors.StripeInvalidRequestError({
      message: 'No such price: price_missing; sk_test_doNotLog', code: 'resource_missing',
      param: 'line_items[0][price]', requestId: 'req_test_diagnostic', statusCode: 400,
    })), '*');
    const response = await handler(new Request('https://test', { method: 'POST', headers: { origin: 'https://app.example' } }));
    const body = await response.json();
    assert(response.status === 500, 'upstream failure must return a controlled HTTP 500');
    assert(body.code === 'STRIPE_REQUEST_FAILED', 'Stripe error misclassified');
    assert(body.request_id === response.headers.get('x-request-id'), 'request correlation missing');
    const log = JSON.stringify(logs);
    assert(log.includes('resource_missing') && log.includes('req_test_diagnostic'), 'Stripe diagnostics lost');
    assert(log.includes('price_missing') && !log.includes('sk_test_doNotLog'), 'message missing or key leaked');
    assert(body.error.includes('price_missing'), 'original error detail missing');
    assert(body.error === body.message && !JSON.stringify(body).includes('sk_test_doNotLog'), 'error contract broken or key leaked');
    assert(response.headers.get('access-control-allow-origin') === 'https://app.example', 'error response lost CORS');
    const missing = billingHandler(() => Promise.resolve(requiredEnv('BULLVEST_MISSING_TEST_CONFIG')), '*');
    const unavailable = await missing(new Request('https://test', { method: 'POST', headers: { origin: 'https://app.example' } }));
    assert(unavailable.status === 500, 'missing config lost status');
    assert((await unavailable.json()).message.includes('BULLVEST_MISSING_TEST_CONFIG'), 'missing config not identified');
  } finally { console.error = original; }
});

Deno.test('billing validates missing and blank Stripe environment before business logic but after preflight', async () => {
  const names = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID'];
  const previous = names.map((name) => Deno.env.get(name));
  let calls = 0;
  const handler = billingHandler(() => {
    validateBillingEnvironment();
    calls++;
    return Promise.resolve({ ok: true });
  }, 'https://app.example');
  const request = (method: string) => new Request('https://test', { method, headers: { origin: 'https://app.example' } });
  try {
    for (const [secret, price] of [[undefined, undefined], ['', 'price_test'], ['sk_test_fixture', '   ']]) {
      for (const [index, value] of [secret, price].entries()) {
        if (value === undefined) Deno.env.delete(names[index]); else Deno.env.set(names[index], value);
      }
      const preflight = await handler(request('OPTIONS'));
      assert(preflight.status === 204 && calls === 0, 'preflight requires Stripe configuration or ran business logic');
      assert(preflight.headers.get('access-control-allow-origin') === 'https://app.example', 'preflight missing CORS');
      const response = await handler(request('POST'));
      const body = await response.json();
      assert(response.status === 500 && calls === 0, 'missing environment reached business logic');
      assert(body.error.includes('Falta STRIPE_SECRET_KEY o STRIPE_PRICE_ID'), 'missing descriptive error');
      assert(body.code === 'BILLING_NOT_CONFIGURED', 'missing configuration error code');
      assert(response.headers.get('access-control-allow-origin') === 'https://app.example', 'config failure missing CORS');
    }
    Deno.env.set(names[0], 'sk_test_fixture'); Deno.env.set(names[1], 'price_test');
    const response = await handler(request('POST'));
    assert(response.status === 200 && Number(calls) === 1, 'valid config rejected');
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) Deno.env.delete(name); else Deno.env.set(name, previous[index]!);
    });
  }
});

Deno.test('global catch handles errors, rejected objects and strings with JSON and CORS', async () => {
  for (const failure of [new Error('Stripe unavailable'), { message: 'Database unavailable' }, 'Network unavailable']) {
    const handler = billingHandler(() => Promise.reject(failure), '*');
    const response = await handler(new Request('https://test', { method: 'POST', headers: { origin: 'https://app.example' } }));
    const body = await response.json();
    assert(response.status === 500, 'unexpected exception escaped as a gateway failure');
    assert(body.error === (typeof failure === 'string' ? failure : failure.message), 'exception detail discarded');
    assert(response.headers.get('content-type')?.includes('application/json'), 'missing JSON content type');
    assert(response.headers.get('access-control-allow-origin') === 'https://app.example', 'exception lost CORS');
  }
});

Deno.test('only paid/active or trialing BullVest subscriptions grant access', () => {
  assert(grantsPro(subscription('active')), 'active rejected');
  assert(grantsPro(subscription('trialing')), 'trial rejected');
  for (const status of ['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'canceled', 'paused']) {
    assert(!grantsPro(subscription(status)), `${status} granted Pro`);
  }
  assert(!grantsPro(subscription('active', { status: 'open', attempted: true, amount_remaining: 1000 })), 'failed invoice granted access');
  assert(!grantsPro(subscription('active', { status: 'uncollectible', attempted: true, amount_remaining: 1000 })), 'written-off invoice granted access');
  assert(grantsPro(subscription('active', { status: 'paid', attempted: true, amount_remaining: 0 })), 'recovered payment rejected');
  assert(isBullVestSubscription(subscription('active'), 'user-a', ['price_bullvest']), 'matching subscription rejected');
  assert(!isBullVestSubscription(subscription('active'), 'user-b', ['price_bullvest']), 'another user accepted');
  assert(!isBullVestSubscription(subscription('active'), 'user-a', ['price_other']), 'another product accepted');
});

Deno.test('billing endpoints enforce origins, methods and authentication', async () => {
  Deno.env.set('APP_ALLOWED_ORIGINS', 'http://localhost:5173');
  const handler = billingHandler(async (request) => { await authenticatedAccount(request); return {}; });
  const denied = await handler(new Request('http://test', { method: 'POST', headers: { origin: 'https://evil.example' } }));
  assert(denied.status === 403 && !denied.headers.has('access-control-allow-origin'), 'origin bypass');
  const preflight = await handler(new Request('http://test', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }));
  assert(preflight.status === 204, 'preflight rejected');
  const anonymous = await handler(new Request('http://test', { method: 'POST', headers: { origin: 'http://localhost:5173' } }));
  assert(anonymous.status === 401, 'anonymous accepted');
});

Deno.test('Stripe signature accepts authentic raw body and rejects modifications/replay', async () => {
  const stripe = new Stripe('sk_test_local_fixture');
  const secret = 'whsec_local_fixture';
  const payload = JSON.stringify({ id: 'evt_test', type: 'invoice.paid', data: { object: {} } });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, cryptoProvider });
  const event = await stripe.webhooks.constructEventAsync(payload, header, secret, undefined, cryptoProvider);
  assert(event.id === 'evt_test', 'signed event rejected');
  for (const [body, signature] of [
    [payload + ' ', header],
    [payload, await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, timestamp: 1, cryptoProvider })],
  ]) {
    let rejected = false;
    try { await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, cryptoProvider); }
    catch { rejected = true; }
    assert(rejected, 'tampered/stale signature accepted');
  }
});

Deno.test('billing CORS normalizes lists and origins before preflight and POST', async () => {
  let calls = 0;
  const handler = billingHandler((_request, origin) => {
    calls++;
    return Promise.resolve({ origin });
  }, ' https://app.example/ , http://localhost:5173/ , ');
  for (const origin of [' https://app.example/ ', 'http://localhost:5173/']) {
    const normalized = origin.trim().replace(/\/$/, '');
    const preflight = await handler(new Request('https://test', { method: 'OPTIONS', headers: { origin } }));
    assert(preflight.status === 204, 'normalized preflight rejected');
    assert(preflight.headers.get('access-control-allow-origin') === normalized, 'wrong CORS origin');
    assert(preflight.headers.get('access-control-allow-methods') === 'POST, OPTIONS', 'missing methods');
    assert(preflight.headers.get('access-control-allow-headers')?.includes('authorization'), 'missing authorization header');
    assert(preflight.headers.get('vary') === 'Origin', 'missing cache variation');
    const before = calls;
    const response = await handler(new Request('https://test', { method: 'POST', headers: { origin } }));
    assert(response.status === 200 && calls === before + 1, 'POST not processed');
    assert((await response.json()).origin === normalized, 'Stripe received unnormalized origin');
  }
  assert(calls === 2, 'preflight invoked billing');
  for (const method of ['OPTIONS', 'POST']) {
    const denied = await handler(new Request('https://test', { method, headers: { origin: 'https://app.example.evil' } }));
    assert(denied.status === 403 && !denied.headers.has('access-control-allow-origin'), 'unlisted origin allowed');
  }
});

Deno.test('empty and wildcard CORS allow any origin without bypassing authentication', async () => {
  const previous = Deno.env.get('APP_ALLOWED_ORIGINS');
  try {
    Deno.env.delete('APP_ALLOWED_ORIGINS');
    for (const allowed of [undefined, '', ' ,  ', '*', 'https://other.example/, * ']) {
      let calls = 0;
      const handler = billingHandler(async (request) => {
        calls++;
        await authenticatedAccount(request);
        return {};
      }, allowed);
      const headers = { origin: 'http://demo.example/' };
      const preflight = await handler(new Request('https://test', { method: 'OPTIONS', headers }));
      assert(preflight.status === 204 && calls === 0, 'preflight invoked authentication');
      assert(preflight.headers.get('access-control-allow-origin') === 'http://demo.example', 'open CORS rejected origin');
      const anonymous = await handler(new Request('https://test', { method: 'POST', headers }));
      assert(anonymous.status === 401, 'authentication bypassed');
      assert(anonymous.headers.get('access-control-allow-origin') === 'http://demo.example', 'error lost CORS');
      const noOrigin = await handler(new Request('https://test', { method: 'OPTIONS' }));
      assert(noOrigin.status === 204 && noOrigin.headers.get('access-control-allow-origin') === '*', 'originless preflight failed');
      for (const origin of ['', 'null', 'https://demo.example/path', 'javascript:alert(1)']) {
        const invalid = await handler(new Request('https://test', { method: 'POST', headers: { origin } }));
        assert(invalid.status === 403, 'invalid Stripe return origin accepted');
      }
      assert(Number(calls) === 1, 'invalid origin reached billing');
    }
  } finally {
    if (previous === undefined) Deno.env.delete('APP_ALLOWED_ORIGINS');
    else Deno.env.set('APP_ALLOWED_ORIGINS', previous);
  }
});
