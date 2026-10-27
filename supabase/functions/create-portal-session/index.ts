import { authenticatedAccount, billingHandler, HttpError, stripeClient } from '../_shared/billing.ts';

Deno.serve(billingHandler(async (request, origin) => {
  const { profile } = await authenticatedAccount(request);
  const customerId: string | null = profile.stripe_customer_id;
  if (!customerId) {
    if (profile.role === 'free' && !profile.stripe_subscription_id) return { action: 'checkout_required' };
    // A new empty customer cannot manage an existing subscription. Preserve the
    // account state and surface the broken link instead of risking a second sale.
    throw new HttpError(409, 'CUSTOMER_NOT_FOUND');
  }
  // The Portal requires the secret key, but not a Checkout price configuration.
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId, return_url: `${origin}/dashboard`,
  });
  return { url: session.url };
}));
