import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000007';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'billing@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
async function account(page: Page, lives = 3, pro = false) {
  const control = { lives, pro, refills: 0, forceExhausted: false, profileReads: 0 };
  await page.addInitScript((sessionUser) => {
    localStorage.setItem('sb-zgycwhxwpxbqtivgssml-auth-token', JSON.stringify({
      access_token: 'billing-test-token', refresh_token: 'billing-test-refresh', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: sessionUser,
    }));
  }, user);
  await page.routeWebSocket('wss://*.supabase.co/**', (ws) => ws.close());
  await page.route('https://*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return send(user);
    if (url.pathname === '/rest/v1/profiles') {
      control.profileReads++;
      return send({ id: userId, display_name: 'Ana', role: control.pro ? 'pro' : 'free', fictional_balance: 10000,
        lives_remaining: control.lives, stripe_customer_id: control.pro ? 'cus_test' : null });
    }
    if (url.pathname === '/functions/v1/refresh-quotes') return send({ refreshed_count: 0 });
    if (['/rest/v1/assets', '/rest/v1/portfolios', '/rest/v1/transactions'].includes(url.pathname)) return send([]);
    if (url.pathname === '/rest/v1/rpc/refill_portfolio_balance') {
      expect(route.request().postDataJSON()).toEqual({});
      control.refills++;
      if (control.forceExhausted || (!control.pro && control.lives === 0)) return send({ message: 'NO_FREE_LIVES_REMAINING', code: 'P0001' }, 400);
      if (!control.pro) control.lives--;
      return send([{ reload_id: crypto.randomUUID(), resulting_balance: 10000, remaining_lives: control.lives }]);
    }
    if (url.pathname === '/functions/v1/create-checkout-session') {
      expect(route.request().postDataJSON()).toEqual({ interval: 'monthly' });
      return send({ url: 'https://checkout.stripe.com/c/pay/cs_test_bullvest' });
    }
    if (url.pathname === '/functions/v1/create-portal-session') return send({ url: 'https://billing.stripe.com/p/session/test_bullvest' });
    throw new Error(`Unexpected API request ${url.pathname}`);
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Stripe Checkout test</h1>' }));
  await page.route('https://billing.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Stripe Portal test</h1>' }));
  return control;
}

test('three refills update lives and fourth attempt offers Checkout', async ({ page }) => {
  const control = await account(page);
  await page.goto('/simulador');
  const refill = page.getByRole('button', { name: 'Recargar 10.000 $', exact: true });
  for (let remaining = 2; remaining >= 0; remaining--) {
    await refill.click();
    await expect(page.getByText(`Plan Free: ${remaining} de 3 recargas restantes.`)).toBeVisible();
  }
  await refill.click();
  await expect(page.getByRole('dialog')).toContainText('Has agotado tus tres vidas');
  expect(control.refills).toBe(3);
  await page.getByRole('dialog').getByRole('button', { name: 'Pasar a Pro' }).click();
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/cs_test_bullvest');
});

test('server exhaustion opens paywall even with a stale profile', async ({ page }) => {
  const control = await account(page, 1);
  control.forceExhausted = true;
  await page.goto('/simulador');
  await page.getByRole('button', { name: 'Recargar 10.000 $', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(control.refills).toBe(1);
});

test('Pro refills with zero lives and can open the customer portal', async ({ page }) => {
  const control = await account(page, 0, true);
  await page.goto('/simulador');
  await page.getByRole('button', { name: 'Recargar 10.000 $', exact: true }).click();
  await expect(page.getByText('Monedero recargado: $10,000.00.')).toBeVisible();
  expect(control.lives).toBe(0);
  await page.getByRole('button', { name: 'Gestionar suscripción', exact: true }).click();
  await expect(page).toHaveURL('https://billing.stripe.com/p/session/test_bullvest');
});

test('success page waits for the server and reacts to a delayed webhook', async ({ page }) => {
  const control = await account(page);
  await page.goto('/checkout/success?session_id=untrusted');
  await expect(page.getByRole('heading', { name: 'Estamos comprobando tu suscripción' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tu plan Pro está activo' })).toHaveCount(0);
  control.pro = true;
  await expect(page.getByRole('heading', { name: 'Tu plan Pro está activo' })).toBeVisible();
  expect(control.profileReads).toBeGreaterThan(1);
});

for (const path of ['/login', '/register']) {
  test(`Google button redirects with the correct provider and dashboard callback from ${path}`, async ({ page }) => {
    await page.route('https://*.supabase.co/auth/v1/authorize**', async (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get('provider')).toBe('google');
      expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:4173/dashboard');
      await route.fulfill({ contentType: 'text/html', body: '<h1>Google OAuth test</h1>' });
    });
    await page.goto(path);
    await expect(page.getByText('O continúa con correo')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    await expect(page).toHaveURL(/\/auth\/v1\/authorize\?/);
  });
}
