import { authenticatedAccount, billingHandler, grantsPro, isBullVestSubscription, requiredEnv, Stripe, validateBillingEnvironment } from './billing.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function subscription(status: string, invoice: object | null = null): Stripe.Subscription {
  return { status, latest_invoice: invoice, metadata: { supabase_user_id: 'user-a' },
    items: { data: [{ price: { id: 'price_bullvest' } }] } } as unknown as Stripe.Subscription;
}

Deno.test('Checkout uses dynamic payment methods and returns safe HTTP 400 for rejected options', async () => {
  const environment: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_PRICE_ID: 'price_test',
    SUPABASE_URL: 'https://billing.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    APP_ALLOWED_ORIGINS: 'https://app.example',
  };
  const previous = Object.fromEntries(Object.keys(environment).map((name) => [name, Deno.env.get(name)]));
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const originalConsoleError = console.error;
  const logs: unknown[][] = [];
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let checkoutRequests = 0;
  let rejectOptions = false;
  const unexpected: string[] = [];
  try {
    for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value);
    // Capture the real Edge Function handler without starting a listener.
    Object.defineProperty(Deno, 'serve', { value: (callback: typeof handler) => { handler = callback; }, configurable: true });
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin === environment.SUPABASE_URL) {
        if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-a', email: 'test@example.test' });
        if (url.pathname === '/rest/v1/profiles') return Response.json({ id: 'user-a', role: 'free', stripe_customer_id: 'cus_test' });
        if (url.pathname === '/rest/v1/rpc/reserve_stripe_checkout') return Response.json('attempt-test');
      }
      if (url.origin === 'https://api.stripe.com') {
        if (request.method === 'GET' && ['/v1/subscriptions', '/v1/checkout/sessions'].includes(url.pathname)) {
          return Response.json({ object: 'list', data: [], has_more: false });
        }
        if (request.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
          checkoutRequests++;
          const params = new URLSearchParams(await request.text());
          assert(![...params.keys()].some((key) => /^(allowed_payment_method_types|payment_method_types|managed_payments|automatic_payment_methods)(\[|$)/.test(key)),
            'Checkout must use dashboard payment methods without unsupported or conflicting options');
          assert(params.get('mode') === 'subscription', 'subscription mode changed');
          assert(params.get('line_items[0][price]') === 'price_test', 'wrong subscription price');
          assert(params.get('customer') === 'cus_test', 'existing customer was not reused');
          assert(request.headers.get('idempotency-key') === 'bullvest-checkout-attempt-test', 'checkout idempotency changed');
          if (rejectOptions) return Response.json({ error: {
            type: 'invalid_request_error', code: 'parameter_unknown', param: 'option_test',
            message: 'Unknown parameter: option_test; sk_test_doNotLog',
          } }, { status: 400, headers: { 'request-id': 'req_test_checkout' } });
          return Response.json({ id: 'cs_test', status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_test' });
        }
      }
      unexpected.push(`${request.method} ${url.origin}${url.pathname}`);
      return Response.json({ error: { type: 'invalid_request_error', message: 'Unexpected test request' } }, { status: 400 });
    };
    await import('../create-checkout-session/index.ts');
    assert(handler, 'Edge Function handler was not registered');
    const response = await handler(new Request('https://billing.example.test/functions/v1/create-checkout-session', {
      method: 'POST', headers: { origin: 'https://app.example', authorization: 'Bearer test-user-token', 'content-type': 'application/json' },
      body: JSON.stringify({ interval: 'monthly' }),
    }));
    const body = await response.json();
    assert(response.status === 200, `Checkout rejected: ${JSON.stringify(body)}`);
    assert(body.url === 'https://checkout.stripe.com/c/pay/cs_test', 'Checkout URL missing');
    assert(checkoutRequests === 1 && unexpected.length === 0, 'unexpected outbound requests');
    assert(response.headers.get('access-control-allow-origin') === 'https://app.example', 'Checkout response lost CORS');
    rejectOptions = true;
    console.error = (...args: unknown[]) => { logs.push(args); };
    const rejected = await handler(new Request('https://billing.example.test/functions/v1/create-checkout-session', {
      method: 'POST', headers: { origin: 'https://app.example', authorization: 'Bearer test-user-token', 'content-type': 'application/json' },
      body: JSON.stringify({ interval: 'monthly' }),
    }));
    const failure = await rejected.json();
    assert(rejected.status === 400 && failure.code === 'STRIPE_REQUEST_FAILED', 'Stripe option rejection must return HTTP 400');
    assert(failure.error.includes('option_test') && failure.error === failure.message, 'Stripe error message lost');
    assert(failure.request_id === rejected.headers.get('x-request-id'), 'request correlation lost');
    assert(rejected.headers.get('access-control-allow-origin') === 'https://app.example', 'Stripe rejection lost CORS');
    const diagnostics = JSON.stringify(logs);
    assert(diagnostics.includes('req_test_checkout') && diagnostics.includes('parameter_unknown'), 'wrapped Stripe diagnostics lost');
    assert(!JSON.stringify(failure).includes('sk_test_doNotLog') && !diagnostics.includes('sk_test_doNotLog'), 'Stripe error leaked a secret');
    assert(Number(checkoutRequests) === 2 && unexpected.length === 0, 'option rejection triggered duplicate requests');
  } finally {
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    Object.defineProperty(Deno, 'serve', { value: originalServe, configurable: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value);
    }
  }
});

Deno.test('Portal repairs Pro customer links, directs Free users to Checkout and contains failures', async (t) => {
  const environment: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_PRICE_ID: 'price_test',
    SUPABASE_URL: 'https://billing.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    APP_ALLOWED_ORIGINS: 'https://app.example',
  };
  const previous = Object.fromEntries(Object.keys(environment).map((name) => [name, Deno.env.get(name)]));
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  try {
    for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value);
    Object.defineProperty(Deno, 'serve', { value: (callback: typeof handler) => { handler = callback; }, configurable: true });
    await import('../create-portal-session/index.ts');
    assert(handler, 'Portal handler was not registered');
    const portalHandler = handler;
    for (const scenario of [
      { name: 'Free without customer', role: 'free', customer: null, expected: 200 },
      { name: 'Pro without customer', role: 'pro', customer: null, expected: 200 },
      { name: 'Pro with customer', role: 'pro', customer: 'cus_existing', expected: 200 },
      { name: 'Free with customer', role: 'free', customer: 'cus_existing', expected: 200 },
      { name: 'concurrent customer link wins', role: 'pro', customer: null, winner: 'cus_concurrent', expected: 200 },
      { name: 'customer creation fails', role: 'pro', customer: null, fail: 'customer', expected: 500 },
      { name: 'profile update fails', role: 'pro', customer: null, fail: 'update', expected: 500 },
      { name: 'profile reread fails', role: 'pro', customer: null, fail: 'read', expected: 500 },
      { name: 'Stripe portal fails', role: 'pro', customer: 'cus_existing', fail: 'portal', expected: 500 },
    ]) {
      await t.step(scenario.name, async () => {
        let savedCustomer: string | null = scenario.customer;
        let created = 0, updated = 0, portals = 0, reads = 0;
        const unexpected: string[] = [];
        globalThis.fetch = async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          const stripeFailure = () => Response.json({ error: { type: 'invalid_request_error', message: 'Stripe fixture failure' } }, { status: 400 });
          if (url.origin === environment.SUPABASE_URL) {
            if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-a', email: 'test@example.test' });
            if (url.pathname === '/rest/v1/profiles') {
              assert(url.searchParams.get('id') === 'eq.user-a', 'profile access used an untrusted user ID');
              if (request.method === 'PATCH') {
                updated++;
                assert(url.searchParams.get('stripe_customer_id') === 'is.null', 'existing customer could be overwritten');
                assert((await request.json()).stripe_customer_id === 'cus_new', 'wrong customer persisted');
                if (scenario.fail === 'update') return Response.json({ message: 'Write failed' }, { status: 400 });
                savedCustomer = scenario.winner ?? 'cus_new';
                return new Response(null, { status: 204 });
              }
              reads++;
              if (reads > 1 && scenario.fail === 'read') return Response.json({ message: 'Read failed' }, { status: 400 });
              return Response.json({ id: 'user-a', role: scenario.role, stripe_customer_id: savedCustomer });
            }
          }
          if (url.origin === 'https://api.stripe.com' && request.method === 'POST') {
            const params = new URLSearchParams(await request.text());
            if (url.pathname === '/v1/customers') {
              created++;
              assert(params.get('metadata[user_id]') === 'user-a', 'customer is not associated with the authenticated user');
              assert(params.get('email') === 'test@example.test', 'email did not come from Auth');
              assert(request.headers.get('idempotency-key') === 'bullvest-portal-customer-user-a', 'customer creation is not idempotent');
              return scenario.fail === 'customer' ? stripeFailure() : Response.json({ id: 'cus_new' });
            }
            if (url.pathname === '/v1/billing_portal/sessions') {
              portals++;
              assert(params.get('customer') === savedCustomer, 'portal did not use the persisted customer');
              assert(params.get('return_url') === 'https://app.example/dashboard', 'portal return URL is incorrect');
              return scenario.fail === 'portal' ? stripeFailure() : Response.json({ url: 'https://billing.stripe.com/p/session/test' });
            }
          }
          unexpected.push(`${request.method} ${url.origin}${url.pathname}`);
          return stripeFailure();
        };
        const response = await portalHandler(new Request('https://billing.example.test/functions/v1/create-portal-session', {
          method: 'POST', headers: { origin: 'https://app.example', authorization: 'Bearer test-user-token', 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: 'another-user', email: 'untrusted@example.test' }),
        }));
        const body = await response.json();
        assert(response.status === scenario.expected, `Unexpected response: ${JSON.stringify(body)}`);
        assert(unexpected.length === 0, 'unexpected outbound request');
        assert(response.headers.get('access-control-allow-origin') === 'https://app.example', 'Portal lost CORS');
        if (scenario.fail) {
          assert(body.request_id === response.headers.get('x-request-id') && typeof body.error === 'string', 'missing structured error');
          assert(body.code === (['customer', 'portal'].includes(scenario.fail) ? 'STRIPE_REQUEST_FAILED' : scenario.fail === 'read' ? 'CUSTOMER_NOT_FOUND' : 'BILLING_UNAVAILABLE'), 'wrong error classification');
          assert(portals === (scenario.fail === 'portal' ? 1 : 0), 'portal opened after an earlier failure');
        } else if (scenario.role === 'free' && !scenario.customer) {
          assert(body.action === 'checkout_required', 'Free user was not directed to Checkout');
          assert(created === 0 && updated === 0 && portals === 0, 'Free user caused Stripe side effects');
        } else {
          assert(body.url === 'https://billing.stripe.com/p/session/test' && portals === 1, 'portal URL missing');
          assert(created === (scenario.customer ? 0 : 1) && updated === created, 'customer was recreated or not linked');
        }
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(Deno, 'serve', { value: originalServe, configurable: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value);
    }
  }
});

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
