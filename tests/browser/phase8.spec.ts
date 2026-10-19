import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PriceAlert } from '../../src/features/notifications/services/notificationService';

const uid = (n: number) => `f8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = { id: uid(1), aud: 'authenticated', role: 'authenticated', email: 'phase8@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
async function account(page: Page) {
  const state = { failRanking: false, failMetrics: false, follows: new Set<string>(), periods: [] as string[], alerts: [] as PriceAlert[], errors: [] as string[] };
  page.on('pageerror', (error) => state.errors.push(error.message));
  await page.addInitScript((sessionUser) => {
    localStorage.setItem('sb-zgycwhxwpxbqtivgssml-auth-token', JSON.stringify({ access_token: 'phase8-test', refresh_token: 'phase8-refresh', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: sessionUser }));
  }, user);
  await page.routeWebSocket('wss://*.supabase.co/**', (ws) => ws.close());
  await page.route('https://*.supabase.co/**', async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const send = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/auth/v1/user') return send(user);
    if (path === '/rest/v1/profiles') return send(url.searchParams.get('select')?.includes('positions:')
      ? { fictional_balance: 1089, positions: [] }
      : { id: user.id, display_name: 'Ana', role: 'free', fictional_balance: 1089, lives_remaining: 3 });
    if (path === '/rest/v1/transactions') return send([]);
    if (path === '/functions/v1/refresh-quotes') return send({ refreshed_count: 1 });
    if (path === '/rest/v1/rpc/get_global_leaderboard') {
      if (state.failRanking) return send({ message: 'Unavailable' }, 500);
      const args = request.postDataJSON(); state.periods.push(args.p_period);
      const all = Array.from({ length: 25 }, (_, index) => ({ rank: index + 1, user_id: uid(index + 1), display_name: index === 0 ? 'Ana' : `Inversor ${index + 1}`,
        total_equity: 11000 - index, roi_pct: 10 - index / 10, win_rate_pct: index === 0 ? 50 : null, sell_count: index === 0 ? 2 : 0,
        badges: index === 0 ? ['first_trade', 'first_lesson'] : [], is_following: state.follows.has(uid(index + 1)), measured_since: '2026-10-10T00:00:00Z' }));
      const filtered = args.p_following ? all.filter((row) => row.is_following) : all;
      return send(filtered.slice(args.p_offset, args.p_offset + args.p_limit).map((row) => ({ ...row, total_count: filtered.length })));
    }
    if (path === '/rest/v1/rpc/get_my_achievements') return send([{ trade_count: 2, completed_lessons: 1, winning_sells: 1, badges: ['first_trade', 'first_win', 'first_lesson'] }]);
    if (path === '/rest/v1/trader_follows') {
      if (request.method() === 'POST') { const body = request.postDataJSON(); expect(body.user_id).toBe(user.id); state.follows.add(body.followed_user_id); }
      else { expect(url.searchParams.get('user_id')).toBe(`eq.${user.id}`); state.follows.delete(url.searchParams.get('followed_user_id')!.slice(3)); }
      return send(null);
    }
    if (path === '/rest/v1/rpc/get_portfolio_performance') {
      if (state.failMetrics) return send({ message: 'Unavailable' }, 500);
      return send([1000, 1100, 990, 1089].map((equity, i) => ({ observed_at: `2026-10-${10 + i}T23:55:00Z`, equity, return_pct: [null, 10, -10, 10][i], is_daily_close: i > 0 && i < 3, quotes_fresh: true })));
    }
    if (path === '/rest/v1/rpc/get_trading_statistics') return send([{ sell_count: 2, winning_sells: 1, win_rate_pct: 50 }]);
    if (path === '/rest/v1/assets') return send([{ id: 'asset-aapl', ticker: 'AAPL', name: 'Apple', currency: 'USD', current_price: 100, sell_price: 99, category: 'stocks', is_tradable: true }]);
    if (path === '/rest/v1/price_alerts') {
      if (request.method() === 'GET') { expect(url.searchParams.get('user_id')).toBe(`eq.${user.id}`); return send(state.alerts); }
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); expect(Object.keys(body).sort()).toEqual(['asset_id', 'direction', 'target_price', 'user_id']); expect(body.user_id).toBe(user.id);
        state.alerts.push({ ...body, id: 'alert-1', created_at: new Date().toISOString(), status: 'triggered', triggered_at: new Date().toISOString(), triggered_price: 100, read_at: null, asset: { ticker: 'AAPL', name: 'Apple', currency: 'USD' } });
      } else {
        expect(url.searchParams.get('user_id')).toBe(`eq.${user.id}`); expect(url.searchParams.get('id')).toBe('eq.alert-1');
        if (request.method() === 'PATCH') { const body = request.postDataJSON(); expect(Object.keys(body)).toEqual(['read_at']); state.alerts[0].read_at = body.read_at; }
        else state.alerts = [];
      }
      return send(null);
    }
    throw new Error(`Unexpected Phase 8 request: ${request.method()} ${path}`);
  });
  return state;
}

test('ranking pagination, periods, medals and persistent follow/unfollow', async ({ page }) => {
  const state = await account(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ranking');
  const table = page.getByRole('region', { name: 'Clasificación global' });
  await expect(table.getByRole('row')).toHaveCount(21);
  await expect(page.getByLabel('Medalla puesto 1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tus insignias' })).toContainText('3/5 desbloqueadas');
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(table).toContainText('Página 2');
  await expect(table.getByRole('row')).toHaveCount(6);
  await page.getByRole('button', { name: 'Mensual', exact: true }).click();
  await expect(table).toContainText('Página 1');
  await expect(table.getByRole('row')).toHaveCount(21);
  expect(state.periods).toContain('month');
  await page.getByRole('button', { name: 'Mensual', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(21);
  await page.getByRole('button', { name: 'Seguir a Inversor 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dejar de seguir a Inversor 2', exact: true })).toBeEnabled();
  await page.getByLabel('Solo inversores que sigo').check();
  await expect(table.getByRole('row')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dejar de seguir a Inversor 2', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/ranking-desktop.png', fullPage: true });
  await page.getByLabel('Solo inversores que sigo').check();
  await page.getByRole('button', { name: 'Dejar de seguir a Inversor 2', exact: true }).click();
  await expect(table).toContainText('Todavía no sigues');
  expect(state.follows.size).toBe(0); expect(state.errors).toEqual([]);
});

test('mobile ranking recovers load errors and stays inside viewport', async ({ page }) => {
  const state = await account(page); state.failRanking = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ranking');
  await expect(page.getByRole('alert')).toBeVisible(); state.failRanking = false;
  await page.getByRole('button', { name: 'Reintentar ranking' }).click();
  await expect(page.getByRole('region', { name: 'Clasificación global' }).getByRole('row')).toHaveCount(21);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ranking-mobile.png', fullPage: true });
  expect(state.errors).toEqual([]);
});

test('notification dialog creates, reads and deletes alerts with keyboard focus', async ({ page }) => {
  const state = await account(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ranking');
  await page.getByRole('button', { name: 'Notificaciones, 0 sin leer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Notificaciones y alertas' });
  await expect(dialog.getByRole('combobox', { name: 'Activo', exact: true })).toHaveValue('asset-aapl');
  await dialog.getByLabel('Precio objetivo').fill('99');
  await dialog.getByRole('button', { name: 'Crear alerta' }).click();
  await expect(dialog.getByText('Precio alcanzado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notificaciones, 1 sin leer' })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Marcar como leída' }).click();
  await expect(dialog.getByText('Leída', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/alerts-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Eliminar alerta de AAPL' }).click();
  await expect(dialog.getByText('No tienes alertas.', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Notificaciones, 0 sin leer' })).toBeFocused();
  expect(state.alerts).toEqual([]); expect(state.errors).toEqual([]);
});

test('advanced dashboard metrics recover independently and render daily equity', async ({ page }) => {
  const state = await account(page); state.failMetrics = true;
  await page.goto('/dashboard');
  const performance = page.getByRole('region', { name: 'Evolución y rendimiento' });
  await expect(performance.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Patrimonio total' })).toContainText('1089,00');
  state.failMetrics = false;
  await performance.getByRole('button', { name: 'Reintentar métricas' }).click();
  await expect(performance.getByRole('img', { name: /Curva diaria.*4 valoraciones/ })).toBeVisible();
  await expect(performance).toContainText('50 %'); await expect(performance).toContainText('10 %');
  await performance.getByRole('button', { name: 'Semanal' }).click();
  await expect(performance.getByRole('img')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/performance-desktop.png', fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Sin conexión · Los datos pueden estar desactualizados.')).toBeVisible();
  expect(state.errors).toEqual([]);
});
