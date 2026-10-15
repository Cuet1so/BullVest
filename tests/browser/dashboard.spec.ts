import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000001';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

async function mockAccount(page: Page, options: { populated?: boolean; pro?: boolean; fail?: boolean } = {}) {
  let requested = false;
  const control = { fail: options.fail ?? false };
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.addInitScript(({ sessionUser }) => {
    localStorage.setItem('sb-zgycwhxwpxbqtivgssml-auth-token', JSON.stringify({
      access_token: 'dashboard-test-token', refresh_token: 'dashboard-test-refresh',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer', user: sessionUser,
    }));
  }, { sessionUser: user });
  await page.route('https://*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return send(user);
    if (url.pathname === '/functions/v1/refresh-quotes') return send({ refreshed_count: 3 });
    if (url.pathname === '/rest/v1/profiles') {
      expect(url.searchParams.get('id')).toBe(`eq.${userId}`);
      if (url.searchParams.get('select')?.includes('positions:')) {
        if (control.fail) return send({ code: 'TEST_ERROR', message: 'Unavailable' }, 500);
        return send({ fictional_balance: options.populated ? 1000 : 50000, positions: options.populated ? [{
          total_quantity: 2, average_buy_price: 15,
          asset: { id: 'asset-1', ticker: 'AAPL', name: 'Apple', current_price: 20, price_updated_at: new Date().toISOString(), price_source: 'simulated' },
        }] : [] });
      }
      return send({ id: userId, display_name: 'Ana', fictional_balance: options.populated ? 1000 : 50000, role: options.pro ? 'pro' : 'free', lives_remaining: 2 });
    }
    if (url.pathname === '/rest/v1/transactions') {
      expect(url.searchParams.get('limit')).toBe('5');
      expect(url.searchParams.get('user_id')).toBe(`eq.${userId}`);
      expect(url.searchParams.get('select')).toContain('assets!transactions_asset_id_fkey');
      return send(options.populated ? [{ id: 'transaction-1', executed_at: new Date().toISOString(), transaction_type: 'BUY', quantity: 2, execution_price: 15, total_value: 30, asset: { ticker: 'AAPL', name: 'Apple' } }] : []);
    }
    if (url.pathname === '/rest/v1/pro_upgrade_requests') {
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ user_id: userId });
        requested = true;
        return send(null, 201);
      }
      return send(requested ? { user_id: userId, created_at: new Date().toISOString() } : null);
    }
    throw new Error(`Unexpected Supabase request: ${request.method()} ${url.pathname}`);
  });
  return { control, browserErrors };
}

test('empty Free account, donut and persistent Pro request', async ({ page }) => {
  const { browserErrors } = await mockAccount(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Patrimonio total' })).toContainText('50.000,00');
  await expect(page.getByRole('region', { name: 'Distribución del patrimonio' })).toContainText('100 %');
  await expect(page.locator('.recharts-surface')).toBeVisible();
  await expect(page.getByText('2 de 3')).toBeVisible();
  await expect(page.getByText('Tu primera operación empieza aquí')).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Solicitar Upgrade a Pro' }).click();
  await expect(page.getByRole('button', { name: 'Solicitud registrada' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Solicitud registrada' })).toBeDisabled();
  expect(browserErrors).toEqual([]);
});

test('populated Pro account works on mobile without document overflow', async ({ page }) => {
  const { browserErrors } = await mockAccount(page, { populated: true, pro: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await expect(page.getByRole('region', { name: 'Patrimonio total' })).toContainText('1040,00');
  await expect(page.getByText('Ilimitadas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Solicitar Upgrade a Pro' })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'BUY' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Distribución del patrimonio' })).toContainText('AAPL');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});

test('load errors can be retried without showing fabricated zero balances', async ({ page }) => {
  const { control, browserErrors } = await mockAccount(page, { fail: true });
  await page.goto('/dashboard');
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar el patrimonio');
  await expect(page.getByText('Patrimonio no disponible')).toBeVisible();
  control.fail = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Patrimonio total' })).toContainText('50.000,00');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
