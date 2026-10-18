// Drives the built game in headless Chrome: checks for console errors, takes screenshots and fires a real shot.
// Usage: npm run build && node scripts/smoke-test.mjs   (serves dist/ on a local port)
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { apiMiddleware } from './api-dev.mjs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const serveStatic = async (req, res) => {
  const path = join('dist', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  try { res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)); }
  catch { res.writeHead(404); res.end(); }
};
const server = createServer((req, res) => apiMiddleware(req, res, () => serveStatic(req, res))).listen(4789);
const api = async body => (await fetch('http://localhost:4789/api/challenge', { method: 'POST', body: JSON.stringify(body) })).json();

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
// Compete: start a challenge from the UI, open a friend's challenge link, and send a finished score.
{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async (page, name) => page.screenshot({ path: `artifact/shots/${name}.png` });
  const text = (page, sel) => page.$eval(sel, el => el.textContent);
  const hooks = page => {
    page.on('console', m => { if (m.type() === 'error') errors.push(`[compete] ${m.text()}`); });
    page.on('pageerror', e => errors.push(`[compete] ${e.message}`));
  };

  // creator: name, then New challenge drops straight into hole 1
  const ctxA = await browser.createBrowserContext(), a = await ctxA.newPage(); hooks(a);
  await a.setViewport({ width: 390, height: 844, isMobile: true });
  await a.goto('http://localhost:4789/', { waitUntil: 'networkidle0' });
  await shot(a, 'compete-1-title');
  await a.click('#btnCompete'); await wait(500);
  await a.click('#btnNewChallenge'); await wait(300);
  const blocked = await a.$eval('#scrCompete', el => !el.hidden);
  await a.type('#cmpName', 'Ama');
  await shot(a, 'compete-2-screen');
  await a.click('#btnNewChallenge');
  // software rendering in headless Chrome leaves little time for the hole checks, so allow a while
  await a.waitForFunction(() => document.getElementById('hudLabel').textContent === 'Your challenge', { timeout: 60000 }).catch(() => {});
  await wait(1200);
  const hud = await text(a, '#hudLabel');
  await shot(a, 'compete-3-hole');
  console.log('compete create', JSON.stringify({ blockedWithoutName: blocked, hud }));
  if (!blocked || hud !== 'Your challenge') errors.push('[compete] creating a challenge did not start hole 1');

  // a friend's link: made through the API with two scores, opened in a separate browser profile via /c/<id>
  const ch = await api({ action: 'create', name: 'Kofi', p: 'k'.repeat(20), v: 1, seed: 424242, ks: [0, 0, 0, 0, 0] });
  await api({ action: 'score', id: ch.id, name: 'Kofi', p: 'k'.repeat(20), holes: [2, 1, 2, 2, 2] });
  await api({ action: 'score', id: ch.id, name: 'Esi', p: 'e'.repeat(20), holes: [3, 2, 2, 2, 2] });
  const ctxB = await browser.createBrowserContext(), b = await ctxB.newPage(); hooks(b);
  await b.setViewport({ width: 390, height: 844, isMobile: true });
  await b.goto(`http://localhost:4789/c/${ch.id}`, { waitUntil: 'networkidle0' }); await wait(800);
  const invite = { url: b.url(), head: await text(b, '.ch-head'), play: await text(b, '#chPlay') };
  await shot(b, 'compete-4-invite');

  // B finished all 5 holes on this device earlier but the score never reached the server: opening sends it
  await b.evaluate(id => {
    const s = JSON.parse(localStorage.getItem('holeshot.save.v1') || '{}');
    s.player = { ...s.player, name: 'Yaw' };
    s.challenges = { [id]: { by: 'Kofi', at: Date.now(), holes: [1, 2, 1, 2, 1], tries: 0, sent: false, rewarded: true } };
    localStorage.setItem('holeshot.save.v1', JSON.stringify(s));
  }, ch.id);
  await b.goto(`http://localhost:4789/?challenge=${ch.id}`, { waitUntil: 'networkidle0' }); await wait(800);
  const result = { head: await text(b, '.ch-head'), rows: await b.$$eval('.board li', ls => ls.length) };
  await shot(b, 'compete-5-result');
  await b.click('#btnChBack'); await wait(800);
  const record = await text(b, '#cmpRecord');
  await shot(b, 'compete-6-record');
  console.log('compete join', JSON.stringify({ invite, result, record }));
  if (!invite.url.includes(`challenge=`) && !invite.url.endsWith('/')) errors.push('[compete] share link did not redirect');
  if (invite.head !== 'Score to beat: 9' || result.head !== 'You’re 1st of 3' || result.rows !== 3) errors.push('[compete] challenge board is wrong');
  if (!/^1\s*Win1\s*Played100%/.test(record.replace(/\s+/g, ''))) errors.push(`[compete] record is wrong: ${record}`);
  await ctxA.close(); await ctxB.close();
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
