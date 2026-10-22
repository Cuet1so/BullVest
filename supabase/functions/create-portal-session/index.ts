import { authenticatedAccount, billingHandler, HttpError, stripeClient, validateBillingEnvironment } from '../_shared/billing.ts';

Deno.serve(billingHandler(async (request, origin) => {
  validateBillingEnvironment();
  const { profile } = await authenticatedAccount(request);
  if (!profile.stripe_customer_id) throw new HttpError(404, 'CUSTOMER_NOT_FOUND');
  const session = await stripeClient().billingPortal.sessions.create({
    customer: profile.stripe_customer_id, return_url: `${origin}/dashboard`,
  });
  return { url: session.url };
}));
