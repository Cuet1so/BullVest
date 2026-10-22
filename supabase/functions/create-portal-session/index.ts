import { authenticatedAccount, billingHandler, HttpError, stripeClient, validateBillingEnvironment } from '../_shared/billing.ts';

Deno.serve(billingHandler(async (request, origin) => {
  const { admin, user, profile } = await authenticatedAccount(request);
  let customerId: string | null = profile.stripe_customer_id;
  if (!customerId && profile.role === 'free') return { action: 'checkout_required' };
  if (!customerId && profile.role !== 'pro') throw new HttpError(400, 'CUSTOMER_NOT_FOUND');
  validateBillingEnvironment();
  const stripe = stripeClient();
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email, metadata: { user_id: user.id },
    }, { idempotencyKey: `bullvest-portal-customer-${user.id}` });
    const { error } = await admin.from('profiles').update({ stripe_customer_id: customer.id })
      .eq('id', user.id).is('stripe_customer_id', null);
    if (error) throw error;
    // Use the persisted winner if another request linked a customer concurrently.
    const { data, error: readError } = await admin.from('profiles').select('stripe_customer_id')
      .eq('id', user.id).single();
    if (readError || !data?.stripe_customer_id) throw new HttpError(500, 'CUSTOMER_NOT_FOUND');
    customerId = data.stripe_customer_id as string;
  }
  // billingHandler catches errors and returns redacted JSON with CORS and request_id.
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId, return_url: `${origin}/dashboard`,
  });
  return { url: session.url };
}));
