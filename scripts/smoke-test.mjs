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
// Music fixtures: a one-track list and a generated one-second tone, so the picker can be tested without real tracks.
function toneWav(sec = 1, rate = 8000) {
  const n = sec * rate, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 8000), 44 + i * 2);
  return b;
}
const musicFixture = (req, res) => {
  if (req.url.startsWith('/music/tracks.json')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify([{ file: 'smoke-test.wav', title: 'Smoke Test', artist: 'Holeshot' }])); return true; }
  if (req.url.startsWith('/music/smoke-test.wav')) { res.writeHead(200, { 'content-type': 'audio/wav' }); res.end(toneWav()); return true; }
  return false;
};
const server = createServer((req, res) => { if (!musicFixture(req, res)) apiMiddleware(req, res, () => serveStatic(req, res)); }).listen(4789);
const api = async body => (await fetch('http://localhost:4789/api/challenge', { method: 'POST', body: JSON.stringify(body) })).json();

await mkdir('artifact/shots', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
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

// Music: a listed track streams when picked; a YouTube link docks the player and holes are fitted above it.
{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const p = await browser.newPage();
  // YouTube's own iframe logs its own noise (ads, tracking); only the game's errors count here
  p.on('console', m => { if (m.type() === 'error' && !/youtube|google|doubleclick|ggpht|ytimg/.test(m.location()?.url || '')) errors.push(`[music] ${m.text()}`); });
  p.on('pageerror', e => errors.push(`[music] ${e.message}`));
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  await p.goto('http://localhost:4789/', { waitUntil: 'networkidle0' });
  await p.click('#btnSettings'); await wait(400);
  const options = await p.$$eval('#settingsList select option', os => os.map(o => o.textContent));
  await p.select('#settingsList select', 'smoke-test.wav'); await wait(1500);
  const streamed = await p.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('/music/smoke-test.wav')));
  await p.select('#settingsList select', 'youtube'); await wait(300);
  await p.type('.yt-field input', 'https://youtu.be/M7lc1UVf-VE?si=abc'); // YouTube's own IFrame API demo video
  await p.click('.yt-field .btn');
  await p.waitForFunction(() => document.querySelector('#ytDock:not([hidden]) iframe'), { timeout: 30000 }).catch(() => {});
  await wait(1500);
  const yt = await p.evaluate(() => ({ docked: !document.getElementById('ytDock').hidden, iframe: document.querySelector('#ytDock iframe')?.src.split('?')[0] || null }));
  await p.screenshot({ path: 'artifact/shots/music-1-settings.png' });
  await p.evaluate(() => { document.querySelector('#scrSettings [data-back]').click(); document.getElementById('btnPlay').click(); });
  await wait(1800);
  await p.screenshot({ path: 'artifact/shots/music-2-hole-dock.png' });
  await p.evaluate(() => document.getElementById('btnPause').click()); await wait(400);
  await p.screenshot({ path: 'artifact/shots/music-3-pause.png' });
  await p.click('#btnYtClose'); await wait(400);
  const closed = await p.evaluate(() => document.getElementById('ytDock').hidden && !document.body.classList.contains('yt-on'));
  console.log('music', JSON.stringify({ options, streamed, yt, closed }));
  if (!options.includes('Smoke Test · Holeshot') || !options.includes('YouTube video or playlist')) errors.push('[music] picker is missing choices');
  if (!streamed) errors.push('[music] picking a track did not stream it');
  if (!yt.docked || !/youtube(-nocookie)?\.com\/embed\/M7lc1UVf-VE/.test(yt.iframe || '')) errors.push(`[music] YouTube did not dock: ${JSON.stringify(yt)}`);
  if (!closed) errors.push('[music] closing the dock did not stop YouTube');
  await p.close();
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
