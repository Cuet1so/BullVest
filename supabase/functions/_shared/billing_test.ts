import { authenticatedAccount, billingHandler, grantsPro, isBullVestSubscription, Stripe } from './billing.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function subscription(status: string, invoice: object | null = null): Stripe.Subscription {
  return { status, latest_invoice: invoice, metadata: { supabase_user_id: 'user-a' },
    items: { data: [{ price: { id: 'price_bullvest' } }] } } as unknown as Stripe.Subscription;
}

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
