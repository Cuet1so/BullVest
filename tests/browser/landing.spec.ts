import { expect, test } from '@playwright/test';

test('public landing is responsive and opens the signup form', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Aprender a invertir');
  await expect(page.getByRole('table')).toContainText('Ilimitadas');
  const headerLogo = page.getByRole('banner').getByRole('link', { name: 'BullVest: ir al inicio' });
  await expect(headerLogo).toHaveAttribute('href', '/');
  await expect.poll(() => headerLogo.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('#contenido img[alt="BullVest"]')).toBeVisible();
  await expect(page.getByRole('contentinfo').getByRole('img', { name: 'BullVest' })).toBeVisible();
  await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(5);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.screenshot({ path: `test-results/landing-${width}.png`, fullPage: true });
  }
  await page.getByRole('link', { name: 'Empezar Gratis', exact: true }).first().click();
  await expect(page).toHaveURL(/\/login\?mode=signup$/);
  await expect(page.getByRole('heading', { name: 'Crear cuenta gratis' })).toBeVisible();
  await expect(page.getByLabel('Nombre visible')).toBeVisible();
  expect(errors).toEqual([]);
});

test('private routes and the Pro CTA require a session', async ({ page }) => {
  for (const path of ['/dashboard', '/simulator', '/academy', '/simulador', '/academia']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  }
  await page.goto('/');
  await page.getByRole('link', { name: 'Ver Pro en mi cuenta' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('an authenticated visitor is redirected from the root to dashboard', async ({ page }) => {
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'landing@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  await page.addInitScript((sessionUser) => {
    localStorage.setItem('sb-zgycwhxwpxbqtivgssml-auth-token', JSON.stringify({
      access_token: 'landing-test-token', refresh_token: 'landing-test-refresh', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: sessionUser,
    }));
  }, user);
  await page.routeWebSocket('wss://*.supabase.co/**', (ws) => ws.close());
  await page.route('https://*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const send = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return send(user);
    if (url.pathname === '/rest/v1/profiles') return send({ id: user.id, display_name: 'Ana', role: 'free', fictional_balance: 10000, lives_remaining: 3, positions: [] });
    if (url.pathname === '/functions/v1/refresh-quotes') return send({ refreshed_count: 0 });
    if (url.pathname === '/rest/v1/rpc/get_trading_statistics') return send([{ sell_count: 0, winning_sells: 0, win_rate_pct: null }]);
    return send([]);
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'BullVest: ir al Dashboard' })).toHaveAttribute('href', '/dashboard');
  await expect(page.getByRole('heading', { name: /Tu mejor inversión/ })).toHaveCount(0);
});

test('brand image failure preserves an accessible home link on both auth forms', async ({ page }) => {
  for (const image of ['/logo.png', '/pwa/icon-192.png', '/pwa/icon-512.png']) {
    await page.route(`**${image}`, (route) => route.fulfill({ status: 404, body: '' }));
  }
  for (const path of ['/login', '/register']) {
    await page.goto(path);
    const logo = page.getByRole('link', { name: 'BullVest: ir al inicio', exact: true });
    await expect(logo.getByTestId('logo-fallback')).toBeVisible();
    await expect(logo).toContainText('BullVest');
    await logo.click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Aprender a invertir');
  }
});

test('Google CTA starts the existing OAuth flow with dashboard return URL', async ({ page }) => {
  await page.route('https://*.supabase.co/auth/v1/authorize**', async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:4173/dashboard');
    await route.fulfill({ contentType: 'text/html', body: '<h1>Google OAuth test</h1>' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page.getByRole('heading', { name: 'Google OAuth test' })).toBeVisible();
});
