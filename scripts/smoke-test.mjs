// Drives the built game in headless Chrome: checks for console errors, takes screenshots and fires a real shot.
// Usage: npm run build && node scripts/smoke-test.mjs   (serves dist/ on a local port)
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = join('dist', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  try { res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)); }
  catch { res.writeHead(404); res.end(); }
}).listen(4789);

await mkdir('artifact/shots', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const run = async (name, viewport) => {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${name}] ${e.message}`));
  await page.goto('http://localhost:4789/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: `artifact/shots/${name}-1-title.png` });
  await page.click('#btnPlay');
  await new Promise(r => setTimeout(r, 1300));
  await page.screenshot({ path: `artifact/shots/${name}-2-hole.png` });
  // pull straight down from the middle of the screen, show the aim guide, then release
  const { width: w, height: h } = viewport;
  await page.mouse.move(w / 2, h * 0.45);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(w / 2, h * 0.45 + i * h * 0.014);
  await page.screenshot({ path: `artifact/shots/${name}-3-aim.png` });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 450));
  await page.screenshot({ path: `artifact/shots/${name}-4-roll.png` });
  await new Promise(r => setTimeout(r, 3600));
  await page.screenshot({ path: `artifact/shots/${name}-5-after.png` });
  const state = await page.evaluate(() => ({
    result: !document.getElementById('mdlResult').hidden,
    banner: document.getElementById('banner').textContent,
    coins: document.getElementById('coinCount').textContent,
    autoQuality: JSON.parse(localStorage.getItem('holeshot.save.v1') || '{}').autoQuality ?? 0,
  }));
  console.log(name, JSON.stringify(state));
  await page.close();
};
await run('phone', { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: false });
await run('desktop', { width: 1280, height: 800, deviceScaleFactor: 1 });
await run('landscape', { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: false });

// World tour: unlock everything, then open one hole per mechanic (and switch between them, which rebuilds the course).
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('console', m => { if (m.type() === 'error') errors.push(`[tour] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[tour] ${e.message}`));
  const done = {};
  for (let w = 0; w < 5; w++) for (let i = 0; i < 12; i++) done[`${w}-${i}`] = true;
  await page.goto('http://localhost:4789/');
  await page.evaluate(d => localStorage.setItem('holeshot.save.v1', JSON.stringify({ done: d, coins: 999 })), done);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('#btnLevels');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'artifact/shots/tour-levels.png' });
  for (const [w, i] of [[1, 2], [2, 2], [3, 0], [3, 1], [4, 11], [1, 11]]) {
    await page.evaluate(() => { document.getElementById('btnHome').click(); });
    await page.evaluate(() => document.getElementById('btnLevels').click());
    await page.evaluate(n => document.querySelectorAll('.hole-btn')[n].click(), w * 12 + i);
    await new Promise(r => setTimeout(r, 1400));
    await page.screenshot({ path: `artifact/shots/tour-w${w + 1}-${i + 1}.png` });
  }
  await page.evaluate(() => document.getElementById('btnHome').click());
  await page.click('#btnShop');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'artifact/shots/tour-shop.png' });
  // settings: turn on the frame-rate counter and force the low graphics tier, then play a hole with them
  await page.evaluate(() => { document.querySelector('#scrShop [data-back]').click(); document.getElementById('btnSettings').click(); });
  await page.evaluate(() => {
    [...document.querySelectorAll('.toggle-row')].find(b => b.textContent.includes('frame rate')).click();
    [...document.querySelectorAll('.seg button')].find(b => b.textContent === 'Low').click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'artifact/shots/tour-settings.png' });
  await page.evaluate(() => { document.querySelector('#scrSettings [data-back]').click(); document.getElementById('btnPlay').click(); });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'artifact/shots/tour-low-fps.png' });
  const low = await page.evaluate(() => ({ lowfx: document.body.classList.contains('lowfx'), fps: document.getElementById('fps').hidden ? null : document.getElementById('fps').textContent }));
  console.log('low tier', JSON.stringify(low));
  if (!low.lowfx || !low.fps) errors.push('[tour] low tier or fps counter did not apply');
  await page.close();
}
// Offline: once the service worker controls the page, a reload with no network must still open the game.
{
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(`[offline] ${e.message}`));
  await page.goto('http://localhost:4789/', { waitUntil: 'networkidle0' });
  const cache = await page.evaluate(async () => { await navigator.serviceWorker.ready; return (await caches.keys()).join(); });
  await page.reload({ waitUntil: 'networkidle0' }); // controlled load: fonts and assets go into the cache
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  const ok = await page.evaluate(() => !!navigator.serviceWorker.controller && !document.getElementById('scrTitle').hidden);
  console.log('offline', JSON.stringify({ cache, ok }));
  if (!ok) errors.push('[offline] game did not open without a network');
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? `\nErrors:\n${errors.join('\n')}` : '\nNo console errors');
