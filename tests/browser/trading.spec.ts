import { expect, test } from '@playwright/test';
import type { Page, WebSocketRoute } from '@playwright/test';
import type { Asset } from '../../src/features/trading/services/tradingService';
import type { MarginPosition } from '../../src/features/trading/services/marginService';

const userId = '00000000-0000-4000-8000-000000000009';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'market@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
function asset(ticker: string, overrides: Partial<Asset> = {}): Asset {
  return { id: ticker, ticker, name: `${ticker} demo`, asset_type: 'stock', category: 'stocks', currency: 'USD', current_price: 100, sell_price: 99,
    change_24h: 1, change_30d: 2, volatility_1d: 3, is_popular: true, is_meme: false, has_options: false, signal_type: 'NEUTRAL',
    high_24h: null, low_24h: null, is_tradable: true, price_updated_at: new Date().toISOString(), price_source: 'simulated', quote_is_delayed: false,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...overrides };
}

async function market(page: Page, options: { largeCatalog?: boolean; fail?: boolean; socket?: (ws: WebSocketRoute) => void } = {}) {
  const assets = options.largeCatalog ? Array.from({ length: 505 }, (_, i) => asset(`T${String(i).padStart(4, '0')}`)) : [
    asset('AAPL', { name: 'Apple', has_options: true, signal_type: 'COMPRA FUERTE', change_24h: 2.3 }),
    asset('BTCUSD', { name: 'Bitcoin', category: 'crypto', current_price: 65000, sell_price: 64950, change_24h: -3.2, change_30d: -4, signal_type: 'VENTA FUERTE' }),
    asset('DOGE', { name: 'Dogecoin', category: 'crypto', is_meme: true, current_price: 0.1822, sell_price: 0.1818, change_24h: 8.1, change_30d: 20 }),
    asset('EURUSD', { name: 'Euro dólar', category: 'forex', is_popular: false, current_price: 1.08234, sell_price: 1.08211 }),
    asset('GOLD', { name: 'Oro', category: 'commodities', is_popular: false, change_24h: null, signal_type: null }),
    asset('INDEX', { category: 'indices', is_popular: false }),
    asset('READONLY', { name: 'Legacy catalog flag', is_tradable: false }),
    asset('NOBID', { sell_price: null }),
    asset('TINY', { name: 'Tiny crypto', category: 'crypto', current_price: 0.000002, sell_price: 0.0000018 }),
  ];
  const control = { fail: options.fail ?? false, trades: [] as Record<string, unknown>[], ranges: [] as number[], balance: 1000, quantity: 5, uncertain: false, failProfileAfterTrade: false, assetGate: null as Promise<void> | null };
  const fills = new Map<string, { action: string; transaction_id: string; resulting_balance: number; position_quantity: number }>();
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.addInitScript((sessionUser) => {
    localStorage.setItem('sb-zgycwhxwpxbqtivgssml-auth-token', JSON.stringify({ access_token: 'market-test-token', refresh_token: 'market-test-refresh',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: sessionUser }));
  }, user);
  await page.routeWebSocket('wss://*.supabase.co/**', options.socket ?? ((ws) => ws.close()));
  await page.route('https://*.supabase.co/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return send(user);
    if (url.pathname === '/rest/v1/price_alerts') return send([]);
    if (url.pathname === '/rest/v1/margin_positions') return send([]);
    if (url.pathname === '/rest/v1/rpc/get_portfolio_performance') return send([]);
    if (url.pathname === '/rest/v1/rpc/get_trading_statistics') return send([{ sell_count: 0, winning_sells: 0, win_rate_pct: null }]);
    if (url.pathname === '/rest/v1/profiles') {
      if (control.failProfileAfterTrade && control.trades.length > 0) return send({ message: 'Profile unavailable' }, 400);
      return send({ id: userId, display_name: 'Ana', role: 'free', fictional_balance: control.balance, lives_remaining: 3, stripe_customer_id: null });
    }
    if (url.pathname === '/functions/v1/refresh-quotes') {
      if (control.fail) return send({ message: 'Unavailable' }, 500);
      assets.forEach((item) => { item.price_updated_at = new Date().toISOString(); });
      return send({ refreshed_count: assets.length });
    }
    if (url.pathname === '/rest/v1/assets') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 500);
      control.ranges.push(offset);
      const snapshot = structuredClone(assets.slice(offset, offset + limit));
      if (control.assetGate) await control.assetGate;
      return send(snapshot);
    }
    if (url.pathname === '/rest/v1/portfolios') return send([{ id: 'holding', user_id: userId, asset_id: 'AAPL', total_quantity: control.quantity, average_buy_price: 90 }]);
    if (url.pathname === '/rest/v1/transactions') return send([]);
    if (url.pathname === '/functions/v1/trading') {
      const body = req.postDataJSON() as { action: string; asset_id: string; order_type: 'BUY' | 'SELL'; quantity: string; request_id: string };
      expect(Object.keys(body).sort()).toEqual(['action', 'asset_id', 'order_type', 'quantity', 'request_id']);
      control.trades.push(body);
      let receipt = fills.get(body.request_id);
      if (!receipt) {
        const quote = assets.find((item) => item.id === body.asset_id)!;
        const price = body.order_type === 'BUY' ? quote.current_price : quote.sell_price!;
        control.balance += (body.order_type === 'BUY' ? -1 : 1) * Number(body.quantity) * price;
        control.quantity += (body.order_type === 'BUY' ? 1 : -1) * Number(body.quantity);
        receipt = { action: 'execute_trade', transaction_id: 'tx', resulting_balance: control.balance, position_quantity: control.quantity };
        fills.set(body.request_id, receipt);
      }
      if (control.uncertain) { control.uncertain = false; return route.abort('failed'); }
      return send(receipt);
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  return { assets, control, browserErrors };
}

test('confirmed trade remains successful when profile refresh fails', async ({ page }) => {
  const { control, browserErrors } = await market(page);
  await page.goto('/simulador');
  const form = page.getByRole('region', { name: 'Formulario de operaciones' });
  await expect(form.getByRole('button', { name: 'Confirmar compra' })).toBeEnabled();
  control.failProfileAfterTrade = true;
  await form.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(form.getByText('Compra confirmada.', { exact: true })).toBeVisible();
  await expect(page.getByText(/La operación está confirmada/)).toBeVisible();
  await expect(form.getByRole('button', { name: 'Confirmar compra' })).toBeDisabled();
  control.failProfileAfterTrade = false;
  await page.getByRole('button', { name: 'Reintentar actualización', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Confirmar compra' })).toBeEnabled();
  expect(control.trades).toHaveLength(1);
  expect(browserErrors).toEqual([]);
});

test('margin order persists TP/SL and reuses request ID after a lost receipt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { control, browserErrors } = await market(page);
  const positions: MarginPosition[] = [];
  const requests: Record<string, unknown>[] = [];
  await page.route('https://*.supabase.co/rest/v1/margin_positions*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(positions) }));
  await page.route('https://*.supabase.co/functions/v1/trading', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (body.action === 'open_margin') {
      if (!positions.length) {
        control.balance -= body.investment;
        positions.push({ id: 'margin-test', user_id: userId, asset_id: 'AAPL', client_request_id: body.request_id, side: body.side,
          investment: body.investment, multiplier: body.multiplier, entry_price: 100, quantity: 5, stop_loss_amount: body.stop_loss, take_profit_amount: body.take_profit,
          commission: 0, opened_at: new Date().toISOString(), closed_at: null, exit_price: null, realized_pnl: null, close_reason: null, balance_after: control.balance });
        return route.abort('failed');
      }
    } else {
      positions[0].closed_at = new Date().toISOString(); positions[0].realized_pnl = -5; positions[0].close_reason = 'manual';
      control.balance += 95;
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ action: body.action, position: positions[0] }) });
  });
  await page.goto('/simulador');
  await page.getByRole('button', { name: 'Margen / Multiplicador' }).click();
  const form = page.getByRole('form', { name: 'Orden de margen' });
  await form.getByLabel('Multiplicador', { exact: true }).selectOption('5');
  await form.getByLabel('Stop Loss', { exact: true }).check();
  await form.getByLabel('Take Profit', { exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/margin-mobile.png', fullPage: true });
  await form.getByRole('button', { name: 'Confirmar posición de margen' }).click();
  await expect(form.getByRole('alert')).toContainText('No se pudo confirmar');
  await form.getByRole('button', { name: 'Confirmar posición de margen' }).click();
  await expect(form.getByRole('status')).toContainText('confirmada');
  expect(requests[0]).toMatchObject({ action: 'open_margin', investment: 100, multiplier: 5, stop_loss: 10, take_profit: 20 });
  expect(requests[1].request_id).toBe(requests[0].request_id);
  expect(control.balance).toBe(900);
  await page.getByRole('button', { name: 'Cerrar posición', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Posiciones de margen', exact: true })).toContainText('Cerrada');
  expect(control.balance).toBe(995);
  expect(browserErrors).toEqual([]);
});

test('Realtime updates Ask/Bid and spread without reloading the catalog', async ({ page }) => {
  let sendAsset: ((record: Asset) => void) | undefined;
  const { assets, control, browserErrors } = await market(page, { socket: (ws) => {
    ws.onMessage((raw) => {
      const [join, ref, topic, event, payload] = JSON.parse(String(raw));
      if (event === 'phx_join') {
        const changes = (payload.config?.postgres_changes ?? []).map((change: Record<string, unknown>, i: number) => ({ ...change, id: i + 1 }));
        ws.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: changes } }]));
        if (topic === 'realtime:public:assets') sendAsset = (record) => ws.send(JSON.stringify([join, null, topic, 'postgres_changes', { ids: [1], data: { schema: 'public', table: 'assets', type: 'UPDATE', commit_timestamp: record.updated_at, record, old_record: {}, columns: [] } }]));
      } else if (event === 'heartbeat') ws.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
    });
  } });
  await page.goto('/simulador');
  await expect(page.getByText('Realtime conectado', { exact: true })).toBeVisible();
  // The socket can subscribe before the initial HTTP snapshot has populated
  // the chart. Wait for that first observation before asserting a second point.
  const chart = page.getByTestId('libertex-chart');
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  await expect(chart.getByTestId('chart-ask')).toContainText('Ask 100 USD');
  await expect(chart).toHaveAttribute('data-points', '1');
  const reads = control.ranges.length;
  const firstTick = new Date(Date.now() + 1000).toISOString();
  sendAsset!({ ...assets[0], current_price: 120, sell_price: 118, updated_at: firstTick, price_updated_at: firstTick });
  await expect(page.locator('[data-ticker="AAPL"]')).toContainText('120,00');
  await expect(page.locator('[data-ticker="AAPL"]')).toContainText('118,00');
  await expect(page.locator('[data-ticker="AAPL"]')).toContainText('1.6667 %');
  await expect(page.getByRole('region', { name: 'Formulario de operaciones' })).toContainText('120,00');
  await expect(chart.getByTestId('chart-ask')).toContainText('120');
  await expect(chart.getByTestId('chart-bid')).toContainText('118');
  await expect(chart.getByTestId('chart-spread')).toContainText('2 USD');
  await expect(chart.locator('.recharts-reference-line-line')).toHaveCount(3);
  await expect(chart.getByTestId('chart-spread-label')).toContainText('2');
  await expect(chart).toHaveAttribute('data-trend', 'up');
  await expect(chart).toContainText('+19.598 %');
  for (const period of ['1M', '5M', '15M', '1H', '1D', '1W']) {
    await chart.getByRole('button', { name: period, exact: true }).click();
    await expect(chart.getByRole('button', { name: period, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await chart.getByRole('button', { name: '1M', exact: true }).click();
  await expect.poll(async () => Number(await chart.getAttribute('data-points'))).toBeGreaterThanOrEqual(2);
  expect(control.ranges.length).toBe(reads);
  let release!: () => void;
  control.assetGate = new Promise<void>((resolve) => { release = resolve; });
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect.poll(() => control.ranges.length).toBeGreaterThan(reads);
  const secondTick = new Date(Date.now() + 2000).toISOString();
  sendAsset!({ ...assets[0], current_price: 150, sell_price: 149, updated_at: secondTick, price_updated_at: secondTick });
  await expect(page.locator('[data-ticker="AAPL"]')).toContainText('150,00');
  release(); control.assetGate = null;
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  await expect(page.locator('[data-ticker="AAPL"]')).toContainText('150,00');
  await expect(chart.getByTestId('chart-spread')).toContainText('1 USD');
  await page.getByRole('button', { name: 'COMPRAR BTCUSD', exact: true }).click();
  await expect(chart).toHaveAttribute('aria-label', 'Gráfico de BTCUSD');
  await expect(chart.getByTestId('chart-ask')).toContainText('65.000');
  await page.getByRole('button', { name: 'COMPRAR AAPL', exact: true }).click();
  await expect(chart.getByTestId('chart-ask')).toContainText('150');
  await expect(chart).toHaveAttribute('data-trend', 'up');
  const lastTick = new Date(Date.now() + 2500).toISOString();
  sendAsset!({ ...assets[0], current_price: 95, sell_price: 94, updated_at: lastTick, price_updated_at: lastTick });
  await expect(chart).toHaveAttribute('data-trend', 'down');
  const plot = await chart.locator('.recharts-surface').boundingBox();
  await page.mouse.move(plot!.x + plot!.width * 0.4, plot!.y + plot!.height * 0.5);
  await expect(chart.locator('.recharts-tooltip-wrapper')).toContainText('Precio medio');
  await page.setViewportSize({ width: 390, height: 844 });
  await chart.scrollIntoViewIfNeeded();
  const chartBox = await chart.boundingBox();
  await page.evaluate((y) => window.scrollTo(0, window.scrollY + y - 220), chartBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await chart.screenshot({ path: 'test-results/libertex-chart-mobile.png' });
  expect(browserErrors).toEqual([]);
});

test('all asset categories expose buy and sell with no local read-only gate', async ({ page }) => {
  const { assets, browserErrors } = await market(page);
  for (const item of assets) item.is_tradable = false; // Legacy cached flag must not lock the UI.
  await page.goto('/simulador');
  for (const [tab, ticker] of [['Acciones', 'AAPL'], ['Criptodivisas', 'BTCUSD'],
    ['Monedas / Forex', 'EURUSD'], ['Productos / Materias Primas', 'GOLD'], ['Índices', 'INDEX']]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('button', { name: `COMPRAR ${ticker}`, exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: `VENDER ${ticker}`, exact: true })).toBeEnabled();
    await page.getByRole('button', { name: `COMPRAR ${ticker}`, exact: true }).click();
    await expect(page.getByRole('region', { name: 'Formulario de operaciones' })).toContainText(ticker);
  }
  expect(browserErrors).toEqual([]);
});

test('market tabs, global search, signals and rankings with desktop layout', async ({ page }) => {
  const { browserErrors } = await market(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/simulador');
  await expect(page.getByRole('tab')).toHaveCount(14);
  await expect(page.getByRole('table', { name: 'Cotizaciones del mercado' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '-3,20 %', exact: true })).toBeVisible();
  await expect(page.getByText('COMPRA FUERTE', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'COMPRAR READONLY', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'VENDER READONLY', exact: true })).toBeEnabled();
  await expect(page.getByText('Solo consulta', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'VENDER NOBID', exact: true })).toBeDisabled();
  await expect(page.locator('[data-ticker="TINY"]')).toContainText('0,0000018 USD');
  await page.screenshot({ path: 'test-results/market-desktop.png', fullPage: true });
  await page.getByRole('tab', { name: 'Acciones', exact: true }).click();
  await expect(page.locator('[data-ticker="BTCUSD"]')).toHaveCount(0);
  await page.getByRole('searchbox').fill('bitcoin');
  await expect(page.locator('[data-ticker]')).toHaveCount(1);
  await expect(page.locator('[data-ticker="BTCUSD"]')).toBeVisible();
  await expect(page.getByText(/Resultados en todo el mercado/)).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(page.locator('[data-ticker="BTCUSD"]')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Principales al alza', exact: true }).click();
  await expect(page.locator('[data-ticker]').first()).toHaveAttribute('data-ticker', 'DOGE');
  await page.getByRole('tab', { name: 'Los que más han perdido', exact: true }).click();
  await expect(page.locator('[data-ticker]').first()).toHaveAttribute('data-ticker', 'BTCUSD');
  await page.getByRole('tab', { name: 'Tendencia a la baja 30d', exact: true }).click();
  await expect(page.locator('[data-ticker]')).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: 'Variación 30 d' })).toBeVisible();
  await page.getByRole('tab', { name: 'Monedas Meme', exact: true }).click();
  await expect(page.locator('[data-ticker="DOGE"]')).toBeVisible();
  await page.getByRole('searchbox').fill('does not exist');
  await expect(page.getByText('No hay activos que coincidan.')).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('row actions select the side, use bid/ask and preserve request ID after uncertain execution', async ({ page }) => {
  const { control, browserErrors } = await market(page);
  await page.goto('/simulador');
  await page.getByRole('button', { name: 'VENDER AAPL', exact: true }).click();
  const order = page.getByRole('region', { name: 'Formulario de operaciones' });
  await expect(order.getByRole('button', { name: 'Vender', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(order).toContainText('99,00 USD');
  await expect(order.getByLabel('Cantidad de unidades')).toBeFocused();
  await order.getByLabel('Cantidad de unidades').fill('2');
  await expect(order).toContainText('$198.00');
  control.uncertain = true;
  await order.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(order.getByRole('alert')).toContainText('Reintenta la misma orden');
  await order.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(order.getByRole('status')).toContainText('Venta confirmada');
  expect(control.trades).toHaveLength(2);
  expect(control.trades[0].request_id).toBe(control.trades[1].request_id);
  expect(control.balance).toBe(1198);
  await page.getByRole('button', { name: 'COMPRAR AAPL', exact: true }).click();
  await expect(order).toContainText('100,00 USD');
  await order.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(order.getByRole('status')).toContainText('Compra confirmada');
  expect(control.balance).toBe(1098);
  expect(control.trades[2].order_type).toBe('BUY');
  expect(browserErrors).toEqual([]);
});

test('mobile horizontal scrolling stays contained and keyboard can reach every filter', async ({ page }) => {
  const { browserErrors } = await market(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/simulador');
  await expect(page.locator('[data-ticker="AAPL"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const firstTab = page.getByRole('tab', { name: 'Populares', exact: true });
  await firstTab.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Tendencia a la baja 30d', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(firstTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'COMPRAR AAPL', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Formulario de operaciones' }).getByLabel('Cantidad de unidades')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/market-mobile.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});

test('catalog pagination includes assets past the first server page', async ({ page }) => {
  const { control } = await market(page, { largeCatalog: true });
  await page.goto('/simulador');
  await expect(page.getByText(/505 de 505 instrumentos/)).toBeVisible();
  await page.getByRole('searchbox').fill('T0504');
  await expect(page.locator('[data-ticker="T0504"]')).toBeVisible();
  expect(control.ranges).toContain(500);
});

test('failed quote refresh offers a retry and does not enable orders', async ({ page }) => {
  const { control } = await market(page, { fail: true });
  await page.goto('/simulador');
  await expect(page.getByRole('alert')).toContainText('No se pudieron actualizar las cotizaciones');
  await expect(page.getByRole('button', { name: 'Confirmar compra' })).toBeDisabled();
  control.fail = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'COMPRAR AAPL', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
