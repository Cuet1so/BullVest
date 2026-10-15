import { adminClient, grantsPro, isBullVestSubscription, priceIds, requiredEnv, Stripe, stripeClient } from '../_shared/billing.ts';

const supported = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.payment_failed', 'invoice.paid', 'invoice.payment_succeeded',
]);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });
  let stripe: Stripe;
  let secret: string;
  try { stripe = stripeClient(); secret = requiredEnv('STRIPE_WEBHOOK_SECRET'); }
  catch { return new Response('Webhook not configured', { status: 503 }); }
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(), signature, secret, undefined, Stripe.createSubtleCryptoProvider(),
    );
  } catch { return new Response('Invalid signature', { status: 400 }); }
  if (!supported.has(event.type)) return Response.json({ received: true });
  try {
    const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription | Stripe.Invoice;
    const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
    if (!customerId) return Response.json({ received: true });
    const admin = adminClient();
    const { data: profile, error } = await admin.from('profiles').select('id')
      .eq('stripe_customer_id', customerId).maybeSingle();
    if (error) throw error;
    // The Stripe account may also serve products unrelated to BullVest.
    if (!profile) return Response.json({ received: true });
    const startedAt = new Date().toISOString();
    // Stripe doesn't guarantee event ordering. Read current state, not the old event snapshot.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId, status: 'all', limit: 100, expand: ['data.latest_invoice'],
    });
    if (subscriptions.has_more) throw new Error('SUBSCRIPTION_LIMIT_EXCEEDED');
    const prices = priceIds();
    const matching = subscriptions.data
      .filter((item) => isBullVestSubscription(item, profile.id, prices))
      .sort((a, b) => b.created - a.created);
    const active = matching.find(grantsPro);
    const current = active ?? matching[0];
    // Ignore invoices/subscriptions for other products on this customer.
    if (!current) return Response.json({ received: true });
    const { error: syncError } = await admin.rpc('apply_stripe_subscription', {
      p_event_id: event.id, p_customer_id: customerId,
      p_subscription_id: current.id, p_status: current.status,
      p_role: active ? 'pro' : 'free', p_sync_started_at: startedAt,
    });
    if (syncError) throw syncError;
    return Response.json({ received: true });
  } catch {
    console.error('stripe_event_sync_failed', event.id, event.type);
    // Non-2xx ensures Stripe retries after transient database/API failures.
    return new Response('Synchronization failed', { status: 500 });
  }
});
