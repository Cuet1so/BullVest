// Derive PWA and social assets from the supplied logo, preserving its artwork.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const source = await readFile('public/logo.png').catch(() => {
  throw new Error('Guarda el logotipo original en public/logo.png antes de ejecutar npm run assets:pwa.');
});
const isPng = source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const isJpeg = source[0] === 255 && source[1] === 216 && source[2] === 255;
if (!isPng && !isJpeg) throw new Error('El logotipo debe contener una imagen PNG o JPEG válida.');
let logo = `data:image/${isPng ? 'png' : 'jpeg'};base64,${source.toString('base64')}`;
await mkdir('public/pwa', { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  if (!isPng) {
    // Normalize a JPEG supplied with a .png name at its original resolution.
    logo = await page.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    }, logo);
    await writeFile('public/logo.png', Buffer.from(logo.split(',')[1], 'base64'));
  }
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:#192426"><img src="${logo}" alt="BullVest" width="${size}" height="${size}" style="display:block;object-fit:contain" /></body>`);
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: `public/pwa/${size === 180 ? 'apple-touch-icon' : `icon-${size}`}.png` });
  }
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<body style="margin:0;background:#192426;color:#fafafa;font-family:Arial,sans-serif"><main style="height:630px;display:flex;align-items:center;gap:36px;padding:36px;box-sizing:border-box"><img src="${logo}" alt="BullVest" width="470" height="470" style="object-fit:contain;flex-shrink:0" /><div><p style="font-size:18px;letter-spacing:4px;color:#d4b15e">EDTECH + WEALTHTECH</p><h1 style="font-size:62px;line-height:1.1;margin:24px 0">Aprende.<br>Practica.<br><span style="color:#34d399">Evoluciona.</span></h1><p style="font-size:22px;color:#cbd5e1">Academia · Simulador · Comunidad</p><p style="font-size:16px;color:#94a3b8">Aprende a invertir con dinero ficticio.</p></div></main></body>`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: 'public/og-image.png' });
} finally { await browser.close(); }
