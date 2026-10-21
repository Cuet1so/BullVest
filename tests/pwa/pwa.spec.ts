import { expect, test } from '@playwright/test';
test('production manifest, icons, metadata and private-data-free offline fallback', async ({ page, context, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('/dashboard'); expect(manifest.display).toBe('standalone');
  for (const size of [192, 512]) {
    const icon = await request.get(`/pwa/icon-${size}.png`); expect(icon.ok()).toBe(true);
    const png = await icon.body(); expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  }
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /BullVest/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/logo.png');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og-image\.png$/);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', /\/og-image\.png$/);
  const social = await request.get('/og-image.png');
  expect(social.ok()).toBe(true);
  const socialPng = await social.body();
  expect(socialPng.readUInt32BE(16)).toBe(1200);
  expect(socialPng.readUInt32BE(20)).toBe(630);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cached = await page.evaluate(async () => {
    const cache = await caches.open('bullvest-offline-v2'); return (await cache.keys()).map((entry) => new URL(entry.url).pathname).sort();
  });
  expect(cached).toEqual(['/offline.html', '/pwa/icon-192.png', '/pwa/icon-512.png']);
  await context.setOffline(true);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Estás sin conexión' })).toBeVisible();
  expect(await page.evaluate(async () => { try { await fetch('/rest/v1/transactions', { method: 'POST', body: '{}' }); return 'queued'; } catch { return 'offline'; } })).toBe('offline');
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Volver a conectar' }).click();
  await expect(page).toHaveURL(/\/login/);
});
