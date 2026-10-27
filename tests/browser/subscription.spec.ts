import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000007';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'billing@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
async function account(page: Page, lives = 3, pro = false) {
  const control = { lives, pro, refills: 0, forceExhausted: false, profileReads: 0,
    failProfile: false, profileFailureStatus: 400, failData: false, refillGate: null as Promise<void> | null, loseReceipt: false,
    subscriptionStatus: null as string | null, checkoutCalls: 0, portalCalls: 0,
    checkoutFailure: null as { status: number; body: unknown; headers?: Record<string, string> } | null,
    portalFailure: null as { status: number; body: unknown } | null, checkoutRequired: false, billingOffline: false };
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
    if (url.pathname === '/rest/v1/price_alerts') return send([]);
    if (url.pathname === '/rest/v1/margin_positions') return send([]);
    if (url.pathname === '/rest/v1/rpc/get_portfolio_performance') return send([]);
    if (url.pathname === '/rest/v1/rpc/get_trading_statistics') return send([{ sell_count: 0, winning_sells: 0, win_rate_pct: null }]);
    if (url.pathname === '/rest/v1/profiles') {
      control.profileReads++;
      if (control.failProfile) return send({ message: 'Profile unavailable' }, control.profileFailureStatus);
      return send({ id: userId, display_name: 'Ana', role: control.pro ? 'pro' : 'free', fictional_balance: 10000,
        lives_remaining: control.lives, stripe_customer_id: control.pro || control.subscriptionStatus ? 'cus_test' : null,
        stripe_subscription_status: control.subscriptionStatus });
    }
    if (url.pathname === '/functions/v1/refresh-quotes') return send({ refreshed_count: 0 });
    if (['/rest/v1/assets', '/rest/v1/portfolios', '/rest/v1/transactions'].includes(url.pathname)) return control.failData ? send({ message: 'Market unavailable' }, 400) : send([]);
    if (url.pathname === '/rest/v1/rpc/refill_portfolio_balance') {
      expect(route.request().postDataJSON()).toEqual({});
      control.refills++;
      if (control.refillGate) await control.refillGate;
      if (control.forceExhausted || (!control.pro && control.lives === 0)) return send({ message: 'NO_FREE_LIVES_REMAINING', code: 'P0001' }, 400);
      if (!control.pro) control.lives--;
      if (control.loseReceipt) return route.abort('failed');
      return send([{ reload_id: crypto.randomUUID(), resulting_balance: 10000, remaining_lives: control.lives }]);
    }
    if (url.pathname === '/functions/v1/create-checkout-session') {
      control.checkoutCalls++;
      if (control.billingOffline) return route.abort('failed');
      if (control.checkoutFailure) return route.fulfill({ status: control.checkoutFailure.status,
        contentType: 'application/json', body: JSON.stringify(control.checkoutFailure.body), headers: control.checkoutFailure.headers });
      expect(route.request().postDataJSON()).toEqual({ interval: 'monthly' });
      return send({ url: 'https://checkout.stripe.com/c/pay/cs_test_bullvest' });
    }
    if (url.pathname === '/functions/v1/create-portal-session') {
      control.portalCalls++;
      if (control.portalFailure) return send(control.portalFailure.body, control.portalFailure.status);
      if (control.checkoutRequired) return send({ action: 'checkout_required' });
      return send({ url: 'https://billing.stripe.com/p/session/test_bullvest' });
    }
    throw new Error(`Unexpected API request ${url.pathname}`);
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Stripe Checkout test</h1>' }));
  await page.route('https://billing.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Stripe Portal test</h1>' }));
  return control;
}

test('double click sends one refill and failed reconciliation retries reads only', async ({ page }) => {
  const control = await account(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/simulador');
  const refill = page.getByRole('button', { name: 'Recargar 10.000 $' });
  await expect(refill).toBeEnabled();
  let release!: () => void;
  control.refillGate = new Promise<void>((resolve) => { release = resolve; });
  await refill.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => control.refills).toBe(1);
  await expect(refill).toBeDisabled();
  control.failProfile = true;
  release();
  await expect(page.getByText(/Monedero recargado:/)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('La recarga está confirmada');
  await expect(refill).toBeDisabled();
  expect(control.lives).toBe(2);
  control.failProfile = false;
  await page.getByRole('button', { name: 'Reintentar actualización', exact: true }).click();
  await expect(refill).toBeEnabled();
  await expect(page.getByText('Plan Free: 2 de 3 recargas restantes.')).toBeVisible();
  expect(control.refills).toBe(1);
  expect(errors).toEqual([]);
});

test('post-refill market failures and manual profile refresh failures are recoverable reads', async ({ page }) => {
  const control = await account(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/simulador');
  const refill = page.getByRole('button', { name: 'Recargar 10.000 $' });
  await expect(refill).toBeEnabled();
  control.failData = true;
  await refill.click();
  await expect(page.getByText(/Monedero recargado:/)).toBeVisible();
  await expect(page.getByText(/La recarga está confirmada/)).toBeVisible();
  await expect(refill).toBeDisabled();
  control.failData = false;
  await page.getByRole('button', { name: 'Reintentar actualización', exact: true }).click();
  await expect(refill).toBeEnabled();
  control.failProfile = true;
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudieron actualizar todos los datos');
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  expect(control.refills).toBe(1);
  expect(errors).toEqual([]);
});

test('network retry timeout releases loading states without replaying the refill', async ({ page }) => {
  test.setTimeout(45_000);
  const control = await account(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/simulador');
  const refill = page.getByRole('button', { name: 'Recargar 10.000 $' });
  await expect(refill).toBeEnabled();
  control.profileFailureStatus = 503;
  control.failProfile = true;
  await refill.click();
  await expect(page.getByText(/Monedero recargado:/)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('La recarga está confirmada', { timeout: 25_000 });
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  await expect(refill).toBeDisabled();
  control.failProfile = false;
  await page.getByRole('button', { name: 'Reintentar actualización', exact: true }).click();
  await expect(refill).toBeEnabled();
  expect(control.refills).toBe(1);
  expect(errors).toEqual([]);
});

test('lost refill receipt is uncertain, never automatically replayed', async ({ page }) => {
  const control = await account(page);
  await page.goto('/simulador');
  const refill = page.getByRole('button', { name: 'Recargar 10.000 $' });
  await expect(refill).toBeEnabled();
  control.loseReceipt = true;
  await refill.click();
  await expect(page.getByRole('alert')).toContainText('Puede haberse aplicado');
  await expect(refill).toBeDisabled();
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByText('Plan Free: 2 de 3 recargas restantes.')).toBeVisible();
  expect(control.refills).toBe(1);
});

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

test('billing HTTP errors preserve response details in console and release the button', async ({ page }) => {
  const control = await account(page);
  const diagnostics: unknown[] = [];
  page.on('console', async (message) => {
    if (message.type() === 'error' && message.text().includes('[Stripe]')) {
      diagnostics.push(await message.args()[1].jsonValue());
    }
  });
  const body = { code: 'INVALID_PRICE', message: 'El precio configurado no existe', details: 'price unavailable' };
  control.checkoutFailure = { status: 400, body };
  await page.goto('/simulador');
  const button = page.getByRole('button', { name: 'Pasar a Pro', exact: true }).first();
  await button.click();
  await expect(page.getByRole('alert')).toContainText('El precio configurado no existe (HTTP 400)');
  await expect(button).toBeEnabled();
  await expect.poll(() => diagnostics).toEqual([expect.objectContaining({ function: 'create-checkout-session', status: 400, data: body, message: expect.any(String) })]);
});

test('Stripe option failures show the server detail and reference instead of only a generic message', async ({ page }) => {
  const control = await account(page);
  control.checkoutFailure = { status: 400, body: {
    code: 'STRIPE_REQUEST_FAILED', error: 'The configured price cannot be used for this Checkout session.',
    message: 'The configured price cannot be used for this Checkout session.', request_id: 'checkout-diagnostic-test',
  } };
  await page.goto('/simulador');
  const button = page.getByRole('button', { name: 'Pasar a Pro', exact: true }).first();
  await button.click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Stripe rechazó la solicitud: The configured price cannot be used for this Checkout session.');
  await expect(alert).toContainText('HTTP 400');
  await expect(alert).toContainText('checkout-diagnostic-test');
  await expect(button).toBeEnabled();
  expect(control.checkoutCalls).toBe(1);
  expect(control.portalCalls).toBe(0);
});

test('portal failures offer recovery without creating another subscription', async ({ page }) => {
  const control = await account(page, 3, true);
  control.portalFailure = { status: 502, body: { code: 'STRIPE_REQUEST_FAILED', request_id: 'billing-reference-1' } };
  await page.goto('/simulador');
  const button = page.getByRole('button', { name: 'Gestionar suscripción', exact: true });
  await button.click();
  await expect(page.getByRole('alert')).toContainText('billing-reference-1');
  await expect(page.getByRole('alert')).toContainText('Puedes reintentar');
  await expect(button).toBeEnabled();
  expect(control.checkoutCalls).toBe(0);
  control.portalFailure = null;
  await button.click();
  await expect(page).toHaveURL('https://billing.stripe.com/p/session/test_bullvest');
  expect(control.portalCalls).toBe(2);
});

test('missing Pro billing link shows an actionable error without starting Checkout', async ({ page }) => {
  const control = await account(page, 3, true);
  control.portalFailure = { status: 409, body: { code: 'CUSTOMER_NOT_FOUND', request_id: 'missing-link-test' } };
  await page.goto('/simulador');
  const button = page.getByRole('button', { name: 'Gestionar suscripción', exact: true });
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Contacta con soporte para recuperar el acceso a tu suscripción.');
  await expect(page.getByRole('alert')).toContainText('missing-link-test');
  await expect(button).toBeEnabled();
  expect(control.checkoutCalls).toBe(0);
  expect(control.portalCalls).toBe(1);
});

test('Stripe error uses the response header reference when the body omits it', async ({ page }) => {
  const control = await account(page);
  control.checkoutFailure = { status: 400, body: { code: 'STRIPE_REQUEST_FAILED', error: 'Invalid price' },
    headers: { 'x-request-id': 'header-reference-test', 'access-control-expose-headers': 'x-request-id' } };
  await page.goto('/simulador');
  const button = page.getByRole('button', { name: 'Pasar a Pro', exact: true }).first();
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Stripe rechazó la solicitud: Invalid price (HTTP 400)');
  await expect(page.getByRole('alert')).toContainText('header-reference-test');
  await expect(button).toBeEnabled();
});

test('network failures keep the diagnostic and allow an explicit retry', async ({ page }) => {
  const control = await account(page);
  control.billingOffline = true;
  await page.goto('/simulador');
  const button = page.getByRole('button', { name: 'Pasar a Pro', exact: true }).first();
  await button.click();
  await expect(page.getByRole('alert')).toContainText('conexión y la configuración CORS');
  await expect(button).toBeEnabled();
  expect(control.checkoutCalls).toBe(1);
});

for (const status of ['active', 'past_due']) {
  test(`Free profile with ${status} subscription enters Checkout and handles the server conflict`, async ({ page }) => {
    const control = await account(page);
    control.subscriptionStatus = status;
    control.checkoutFailure = { status: 409, body: { code: 'SUBSCRIPTION_EXISTS' } };
    await page.goto('/simulador');
    await page.getByRole('button', { name: 'Pasar a Pro', exact: true }).first().click();
    await expect(page).toHaveURL('https://billing.stripe.com/p/session/test_bullvest');
    expect(control.checkoutCalls).toBe(1);
    expect(control.portalCalls).toBe(1);
  });
}

test('portal checkout_required opens Checkout for a stale Pro profile', async ({ page }) => {
  const control = await account(page, 3, true);
  control.checkoutRequired = true;
  await page.goto('/simulador');
  await page.getByRole('button', { name: 'Gestionar suscripción', exact: true }).click();
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/cs_test_bullvest');
  expect(control.portalCalls).toBe(1);
  expect(control.checkoutCalls).toBe(1);
});

for (const pro of [false, true]) {
  test(`contradictory billing responses stop after one handoff from ${pro ? 'Portal' : 'Checkout'}`, async ({ page }) => {
    const control = await account(page, 3, pro);
    control.checkoutRequired = true;
    control.checkoutFailure = { status: 409, body: { code: 'SUBSCRIPTION_EXISTS' } };
    await page.goto('/simulador');
    const button = page.getByRole('button', { name: pro ? 'Gestionar suscripción' : 'Pasar a Pro', exact: true }).first();
    await button.click();
    await expect(page.getByRole('alert')).toContainText(pro ? 'Ya tienes una suscripción' : 'El estado de tu suscripción ha cambiado');
    await expect(button).toBeEnabled();
    expect(control.portalCalls).toBe(1);
    expect(control.checkoutCalls).toBe(1);
  });
}

test('canceled subscription with stale Pro role can open Checkout', async ({ page }) => {
  const control = await account(page, 3, true);
  control.subscriptionStatus = 'canceled';
  await page.goto('/simulador');
  await page.getByRole('button', { name: 'Pasar a Pro', exact: true }).first().click();
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/cs_test_bullvest');
  expect(control.portalCalls).toBe(0);
});

test('server subscription conflict redirects stale Free profile to portal once', async ({ page }) => {
  const control = await account(page);
  control.checkoutFailure = { status: 409, body: { code: 'SUBSCRIPTION_EXISTS' } };
  await page.goto('/simulador');
  await page.getByRole('button', { name: 'Pasar a Pro', exact: true }).first().click();
  await expect(page).toHaveURL('https://billing.stripe.com/p/session/test_bullvest');
  expect(control.checkoutCalls).toBe(1);
  expect(control.portalCalls).toBe(1);
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
