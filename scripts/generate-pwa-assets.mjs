// Reproducible brand assets, rendered from vectors with the existing browser tooling.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';

await mkdir('public/pwa', { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const logo = '<rect width="512" height="512" fill="#09090b"/><rect x="100" y="100" width="312" height="312" rx="76" fill="#34d399"/><path d="M157 320 L223 254 L275 288 L355 192 M292 192 H355 V255" fill="none" stroke="#09090b" stroke-width="28" stroke-linejoin="round" stroke-linecap="round"/>';
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0"><svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${logo}</svg></body>`);
    await page.screenshot({ path: `public/pwa/${size === 180 ? 'apple-touch-icon' : `icon-${size}`}.png` });
  }
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<body style="margin:0;background:#09090b;color:#fafafa;font-family:Arial,sans-serif"><main style="padding:64px 80px"><div style="display:flex;align-items:center;gap:24px"><svg width="100" height="100" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${logo}</svg><b style="font-size:42px">BullVest</b></div><h1 style="font-size:68px;line-height:1.12;margin:36px 0 24px">Aprende. Invierte.<br><span style="color:#34d399">Evoluciona.</span></h1><p style="font-size:26px;color:#a1a1aa">Academia · Simulador · Comunidad</p><p style="font-size:18px;color:#71717a;margin-top:36px">Invierte con dinero ficticio. Aprende con experiencia real.</p></main></body>`);
  await page.screenshot({ path: 'public/og-bullvest.png' });
} finally { await browser.close(); }
