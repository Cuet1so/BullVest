import { authenticatedAccount, billingHandler, checkoutIdempotencyKey, HttpError, priceIds, Stripe, stripeClient, validateBillingEnvironment } from '../_shared/billing.ts';

Deno.serve(billingHandler(async (request, origin) => {
  validateBillingEnvironment();
  const { admin, user, profile } = await authenticatedAccount(request);
  let payload: { interval?: string };
  try { payload = await request.json(); } catch { throw new HttpError(400, 'INVALID_REQUEST'); }
  if (!payload || !['monthly', 'annual', undefined].includes(payload.interval)) {
    throw new HttpError(400, 'INVALID_REQUEST');
  }
  const prices = priceIds();
  const price = payload.interval === 'annual' ? prices[1] : prices[0];
  if (!price) throw new HttpError(400, 'ANNUAL_PLAN_UNAVAILABLE');
  // Stripe's subscription state below is authoritative, including after cancellation
  // when a delayed webhook has not updated the local Pro role yet.
  const stripe = stripeClient();
  let customerId: string | null = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email, metadata: { supabase_user_id: user.id },
    }, { idempotencyKey: `bullvest-customer-${user.id}` });
    const { error } = await admin.from('profiles').update({ stripe_customer_id: customer.id })
      .eq('id', user.id).is('stripe_customer_id', null);
    if (error) throw error;
    // Read back the winner if two requests initialized the customer concurrently.
    const { data, error: readError } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
    if (readError || !data?.stripe_customer_id) throw new HttpError(500, 'CUSTOMER_NOT_FOUND');
    customerId = data.stripe_customer_id as string;
  }
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  if (subscriptions.has_more || subscriptions.data.some((item) =>
    !['canceled', 'incomplete_expired'].includes(item.status))) {
    throw new HttpError(409, 'SUBSCRIPTION_EXISTS');
  }
  // Reuse a pending session, including across tabs. A different plan must wait/cancel.
  const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 });
  const existing = sessions.data.find((session) => session.metadata?.supabase_user_id === user.id);
  if (existing) {
    if (existing.metadata?.price_id !== price || existing.metadata?.origin !== origin) {
      throw new HttpError(409, 'CHECKOUT_ALREADY_OPEN');
    }
    return { url: existing.url };
  }
  const generation = subscriptions.data.sort((a, b) => b.created - a.created)[0]?.id ?? 'initial';
  const { data: requestId, error: reservationError } = await admin.rpc('reserve_stripe_checkout', {
    p_user_id: user.id, p_price_id: price, p_origin: origin, p_generation: generation,
  });
  if (reservationError?.message === 'CHECKOUT_ALREADY_OPEN') throw new HttpError(409, 'CHECKOUT_ALREADY_OPEN');
  if (reservationError || !requestId) throw new HttpError(500, 'BILLING_UNAVAILABLE');
  // Omit all payment-method overrides; inherit the account's Dashboard settings.
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription', customer: customerId, client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard?checkout=canceled`,
    metadata: { supabase_user_id: user.id, price_id: price, origin },
    subscription_data: { metadata: { supabase_user_id: user.id } },
  };
  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: await checkoutIdempotencyKey(requestId, params),
  });
  if (!session.url || session.status !== 'open') throw new HttpError(409, 'CHECKOUT_ALREADY_COMPLETED');
  return { url: session.url };
}));
