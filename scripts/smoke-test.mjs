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
  const clean = decodeURIComponent(req.url.split('?')[0]).replace(/^\/(about|privacy)$/, '/$1.html'); // like cleanUrls
  const path = join('dist', clean.replace(/\/$/, '/index.html'));
  try { const body = await readFile(path); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); }
  catch { // like Vercel: unknown addresses get the 404 page
    try { res.writeHead(404, { 'content-type': 'text/html' }); res.end(await readFile(join('dist', '404.html'))); } catch { res.end(); }
  }
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
const errors = [];

// The real track list and the MP3s beside it must match (the browser checks below use a fixture list instead).
{
  const { readdir } = await import('node:fs/promises');
  const list = JSON.parse(await readFile('public/music/tracks.json', 'utf8'));
  const files = (await readdir('public/music')).filter(f => f.endsWith('.mp3'));
  const missing = list.filter(t => !files.includes(t.file)).map(t => t.file), unlisted = files.filter(f => !list.some(t => t.file === f));
  console.log('tracks', JSON.stringify({ listed: list.length, missing, unlisted }));
  if (missing.length || unlisted.length) errors.push(`[music] tracks.json and public/music disagree: missing ${missing.join(', ') || 'none'}, unlisted ${unlisted.join(', ') || 'none'}`);
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
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

  // creator: name, New challenge opens the invite first, then they play all 5 holes (sunk through the test hook)
  const ctxA = await browser.createBrowserContext(), a = await ctxA.newPage(); hooks(a);
  await a.setViewport({ width: 390, height: 844, isMobile: true });
  await a.goto('http://localhost:4789/#autotest', { waitUntil: 'networkidle0' });
  await shot(a, 'compete-1-title');
  await a.click('#btnCompete'); await wait(500);
  await a.click('#btnNewChallenge'); await wait(300);
  const blocked = await a.$eval('#scrCompete', el => !el.hidden);
  await a.type('#cmpName', 'Ama');
  await shot(a, 'compete-2-screen');
  await a.click('#btnNewChallenge');
  // software rendering in headless Chrome leaves little time for the hole checks, so allow a while
  await a.waitForFunction(() => document.getElementById('chShare'), { timeout: 60000 }).catch(() => {});
  const invite0 = { head: await text(a, '.ch-head'), status: await text(a, '.ch-status'), play: await text(a, '#chPlay') };
  await shot(a, 'compete-3-invite');
  await a.click('#chPlay');
  await a.waitForFunction(() => document.getElementById('hudLabel').textContent === 'Your challenge', { timeout: 20000 }).catch(() => {});
  const hud = await text(a, '#hudLabel');
  await shot(a, 'compete-3b-hole');
  for (let hole = 1; hole <= 5; hole++) {
    await a.waitForFunction(() => window.__holeshot.sink(), { timeout: 20000, polling: 200 }).catch(() => errors.push(`[compete] hole ${hole} never became playable`));
    await wait(300);
  }
  await a.waitForFunction(() => document.querySelector('#scrChallenge:not([hidden]) .board'), { timeout: 20000 }).catch(() => {});
  const finished = { head: await text(a, '.ch-head').catch(() => null), rows: await a.$$eval('.board li', ls => ls.length) };
  await shot(a, 'compete-3c-finished');
  console.log('compete create', JSON.stringify({ blockedWithoutName: blocked, invite0, hud, finished }));
  if (!blocked || invite0.head !== 'Invite your friends' || !invite0.play.includes('Play your 5 holes')) errors.push('[compete] a new challenge did not open on its invite');
  if (hud !== 'Your challenge') errors.push('[compete] Play did not start hole 1');
  if (finished.head !== 'You’re on the board' || finished.rows !== 1) errors.push(`[compete] finishing 5 holes did not post the score: ${JSON.stringify(finished)}`);

  // someone accepts Ama's challenge: her title screen shows a badge and her list marks it
  const aId = await a.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('holeshot.save.v1')).challenges)[0]);
  await fetch('http://localhost:4789/api/challenge', { method: 'POST', body: JSON.stringify({ action: 'join', id: aId, name: 'Esi', p: 'z'.repeat(20) }) });
  await a.evaluate(() => { document.getElementById('btnChBack').click(); });
  await wait(300);
  await a.evaluate(() => document.querySelector('#scrCompete [data-back]').click());
  await a.waitForFunction(() => !document.getElementById('competeBadge').hidden, { timeout: 10000 }).catch(() => {});
  const badge = await a.$eval('#competeBadge', b => (b.hidden ? null : b.textContent));
  await shot(a, 'compete-3d-badge');
  await a.click('#btnCompete'); await wait(1500);
  const row = await a.$eval('.ch-row', r => ({ text: r.textContent, fresh: r.classList.contains('fresh') }));
  await shot(a, 'compete-3e-list');
  console.log('compete news', JSON.stringify({ badge, row }));
  if (badge !== '1' || !row.fresh || !row.text.includes('Esi joined · 0 finished')) errors.push('[compete] news of someone accepting did not show');

  // live, creator's side: the list and then the open challenge update on their own while she watches
  const post = body => fetch('http://localhost:4789/api/challenge', { method: 'POST', body: JSON.stringify(body) });
  await post({ action: 'score', id: aId, name: 'Esi', p: 'z'.repeat(20), holes: [2, 2, 2, 2, 2] });
  const liveList = await a.waitForFunction(() => document.querySelector('.ch-row')?.textContent.includes('1 finished'), { timeout: 9000 }).then(() => true, () => false);
  await a.click('.ch-row');
  await a.waitForFunction(() => document.querySelector('#scrChallenge:not([hidden]) .ch-status'), { timeout: 8000 }).catch(() => {});
  await post({ action: 'join', id: aId, name: 'Kwame', p: 'q'.repeat(20) });
  const liveScreen = await a.waitForFunction(() => document.querySelector('.ch-status')?.textContent.startsWith('2 accepted'), { timeout: 9000 }).then(() => true, () => false);
  await shot(a, 'compete-3f-live');
  console.log('compete live (creator)', JSON.stringify({ liveList, liveScreen }));
  if (!liveList || !liveScreen) errors.push('[compete] the creator’s views did not update live');

  // a friend's link: made through the API with two scores, opened in a separate browser profile via /c/<id>
  const ch = await api({ action: 'create', name: 'Kofi', p: 'k'.repeat(20), v: 1, seed: 424242, ks: [0, 0, 0, 0, 0] });
  await api({ action: 'score', id: ch.id, name: 'Kofi', p: 'k'.repeat(20), holes: [2, 1, 2, 2, 2] });
  await api({ action: 'score', id: ch.id, name: 'Esi', p: 'e'.repeat(20), holes: [3, 2, 2, 2, 2] });
  const ctxB = await browser.createBrowserContext(), b = await ctxB.newPage(); hooks(b);
  await b.setViewport({ width: 390, height: 844, isMobile: true });
  await b.goto(`http://localhost:4789/c/${ch.id}`, { waitUntil: 'networkidle0' }); await wait(800);
  const invite = { url: b.url(), head: await text(b, '.ch-head'), play: await text(b, '#chPlay') };
  await shot(b, 'compete-4-invite');
  // accepting: Yaw types a name and taps Play, and Kofi's scoreboard lists him as playing
  await b.type('#chName', 'Yaw');
  await b.click('#chPlay'); await wait(1500);
  const kofiView = await (await fetch(`http://localhost:4789/api/challenge?id=${ch.id}&p=${'k'.repeat(20)}`)).json();
  console.log('compete accept', JSON.stringify(kofiView.playing));
  if (kofiView.playing.map(p => p.name).join() !== 'Yaw') errors.push('[compete] accepting did not show up for the creator');

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
  // live, joiner's side: another player finishes while Yaw watches the scoreboard
  await api({ action: 'score', id: ch.id, name: 'Akos', p: 'a'.repeat(20), holes: [3, 3, 3, 3, 3] });
  const liveJoiner = await b.waitForFunction(() => document.querySelectorAll('.board li').length === 4, { timeout: 9000 }).then(() => true, () => false);
  console.log('compete live (joiner)', liveJoiner);
  if (!liveJoiner) errors.push('[compete] the joiner’s scoreboard did not update live');
  await b.click('#btnChBack'); await wait(800);
  const record = await text(b, '#cmpRecord');
  await shot(b, 'compete-6-record');
  console.log('compete join', JSON.stringify({ invite, result, record }));
  if (!invite.url.includes(`challenge=`) && !invite.url.endsWith('/')) errors.push('[compete] share link did not redirect');
  if (invite.head !== 'Score to beat: 9' || result.head !== 'You’re 1st of 3' || result.rows !== 3) errors.push('[compete] challenge board is wrong');
  if (!/^1\s*Win1\s*Played100%/.test(record.replace(/\s+/g, ''))) errors.push(`[compete] record is wrong: ${record}`);

  // Settings → Delete my Compete data (two taps): Yaw's score leaves the scoreboard and his record resets
  await b.evaluate(() => { document.querySelector('#scrCompete [data-back]').click(); document.getElementById('btnSettings').click(); });
  await wait(300);
  await b.click('#btnForget'); await b.click('#btnForget'); await wait(1200);
  const afterForget = await (await fetch(`http://localhost:4789/api/challenge?id=${ch.id}&p=${'k'.repeat(20)}`)).json();
  const forgot = { toast: await text(b, '#toast'), stillListed: afterForget.players.some(p => p.name === 'Yaw') };
  console.log('compete forget', JSON.stringify(forgot));
  if (forgot.stillListed || !forgot.toast.includes('deleted')) errors.push('[compete] Delete my Compete data did not remove the score');
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
  const credits = await p.$$eval('#musicCredits:not([hidden]) li', ls => ls.map(l => l.textContent));
  if (credits[0] !== 'Smoke Test by Holeshot' || !credits.at(-1)?.includes('Pixabay')) errors.push(`[music] credits missing: ${JSON.stringify(credits)}`);
  // the branded picker: a pill that opens the music sheet; Escape closes it without leaving Settings
  const pick = async id => { await p.click('#settingsList .music-pick'); await wait(300); await p.click(`#musicList [data-id="${id}"]`); await wait(300); };
  await p.click('#settingsList .music-pick'); await wait(400);
  const options = await p.$$eval('#musicList [role="option"]', os => os.map(o => `${o.querySelector('.name').textContent}${o.querySelector('small') ? ` · ${o.querySelector('small').textContent}` : ''}`));
  const groups = await p.$$eval('#musicList .sheet-group', gs => gs.map(g => g.textContent));
  await p.screenshot({ path: 'artifact/shots/music-0-sheet.png' });
  await p.keyboard.press('Escape'); await wait(200);
  const sheetClosed = await p.evaluate(() => document.getElementById('musicSheet').hidden && !document.getElementById('scrSettings').hidden);
  if (!sheetClosed) errors.push('[music] Escape did not close the music sheet');
  await pick('smoke-test.wav'); await wait(1200);
  const streamed = await p.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('/music/smoke-test.wav')));
  const pill = await p.$eval('#settingsList .music-pick span', s => s.textContent);
  if (pill !== 'Smoke Test') errors.push(`[music] the picker button doesn't show the chosen track: ${pill}`);
  await pick('youtube');
  await p.type('.yt-field input', 'https://youtu.be/M7lc1UVf-VE?si=abc'); // YouTube's own IFrame API demo video
  await p.click('.yt-field .btn');
  // one player is made once and then loaded with videos, so ask it what it's playing rather than reading its URL
  await p.waitForFunction(() => window.YT?.get?.('ytPlayer')?.getVideoUrl?.()?.includes('M7lc1UVf-VE'), { timeout: 30000 }).catch(() => {});
  const yt = await p.evaluate(() => ({
    docked: !document.getElementById('ytDock').hidden,
    host: document.querySelector('#ytDock iframe')?.src.split('/embed')[0] || null,
    video: window.YT?.get?.('ytPlayer')?.getVideoUrl?.() || null,
  }));
  await p.screenshot({ path: 'artifact/shots/music-1-settings.png' });
  await p.evaluate(() => { document.querySelector('#scrSettings [data-back]').click(); document.getElementById('btnPlay').click(); });
  await wait(1800);
  await p.screenshot({ path: 'artifact/shots/music-2-hole-dock.png' });
  await p.evaluate(() => document.getElementById('btnPause').click()); await wait(400);
  await p.screenshot({ path: 'artifact/shots/music-3-pause.png' });
  await p.click('#pauseQuick .icon-btn'); await wait(600); // the speaker: mutes everything, YouTube included
  const ytMuted = await p.evaluate(() => window.YT?.get?.('ytPlayer')?.isMuted?.() ?? null);
  await p.click('#pauseQuick .icon-btn'); await wait(300);
  if (ytMuted !== true) errors.push(`[music] the speaker did not mute YouTube (${ytMuted})`);
  await p.click('#btnYtClose'); await wait(400);
  const closed = await p.evaluate(() => document.getElementById('ytDock').hidden && !document.body.classList.contains('yt-on'));
  console.log('music', JSON.stringify({ options, groups, streamed, yt, ytMuted, closed }));
  if (!options.includes('Smoke Test · Holeshot') || !options.some(o => o.startsWith('YouTube')) || groups.length !== 3) errors.push('[music] picker is missing choices');
  if (!streamed) errors.push('[music] picking a track did not stream it');
  if (!yt.docked || yt.host !== 'https://www.youtube-nocookie.com' || !yt.video?.includes('M7lc1UVf-VE')) errors.push(`[music] YouTube did not dock: ${JSON.stringify(yt)}`);
  if (!closed) errors.push('[music] closing the dock did not stop YouTube');
  await p.close();
}

// About and Privacy pages: load cleanly, show credits, and are linked from Settings.
{
  const p = await browser.newPage();
  p.on('console', m => { if (m.type() === 'error') errors.push(`[pages] ${m.text()}`); });
  p.on('pageerror', e => errors.push(`[pages] ${e.message}`));
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  const pages = {};
  for (const name of ['about', 'privacy']) {
    const res = await p.goto(`http://localhost:4789/${name}`, { waitUntil: 'networkidle0' });
    pages[name] = { status: res.status(), title: await p.title(), sections: await p.$$eval('main section', s => s.length) };
    await p.screenshot({ path: `artifact/shots/page-${name}.png`, fullPage: true });
  }
  pages.credits = await p.goto('http://localhost:4789/about', { waitUntil: 'networkidle0' }).then(() => p.$$eval('#credits li', ls => ls.map(l => l.textContent)));
  // the games above all ran in one browser profile, so they count as one player
  pages.stats = await p.$eval('#stats', s => (s.hidden ? null : s.querySelector('[data-k="players"]').textContent));
  await p.goto('http://localhost:4789/', { waitUntil: 'networkidle0' });
  await p.click('#btnSettings'); await new Promise(r => setTimeout(r, 300));
  pages.links = await p.$$eval('.page-links a', as => as.map(a => a.getAttribute('href')));
  console.log('pages', JSON.stringify(pages));
  if (pages.about.status !== 200 || pages.privacy.status !== 200 || pages.privacy.sections < 5) errors.push('[pages] a page did not load');
  if (pages.credits[0] !== 'Smoke Test by Holeshot') errors.push(`[pages] About credits wrong: ${pages.credits}`);
  if (pages.stats !== '1') errors.push(`[pages] About stats should show 1 player, got ${pages.stats}`);
  if (pages.links.join() !== './about,./privacy') errors.push(`[pages] Settings links wrong: ${pages.links}`);
  await p.close();
}

// When things go wrong: unknown addresses, a dead challenge link, no WebGL, and the graphics lost mid-game.
{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fresh = async () => {
    const p = await browser.newPage();
    p.on('pageerror', e => errors.push(`[errors] ${e.message}`));
    await p.setViewport({ width: 390, height: 844, isMobile: true });
    return p;
  };
  const out = {};
  let p = await fresh();
  const res = await p.goto('http://localhost:4789/some/deep/missing-page', { waitUntil: 'networkidle0' });
  out.notFound = { status: res.status(), title: await p.title(), styled: await p.evaluate(() => getComputedStyle(document.body).backgroundImage.includes('gradient')) };
  await p.screenshot({ path: 'artifact/shots/error-404.png' });
  await p.goto('http://localhost:4789/?challenge=zzzzzz99', { waitUntil: 'networkidle0' }); await wait(1200);
  out.deadLink = { msg: await p.$eval('.ch-msg', e => e.textContent).catch(() => null), button: await p.$eval('#chToCompete', b => b.textContent).catch(() => null) };
  await p.close();

  p = await fresh(); // a browser with WebGL switched off
  await p.evaluateOnNewDocument(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : get.call(this, t, ...a); }; });
  await p.goto('http://localhost:4789/', { waitUntil: 'networkidle0' });
  out.noWebgl = await p.$eval('#fatal h2', e => e.textContent).catch(() => null);
  await p.screenshot({ path: 'artifact/shots/error-webgl.png' });
  await p.close();

  p = await fresh(); // the graphics context dropped while playing
  await p.goto('http://localhost:4789/', { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.querySelector('#stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await wait(500);
  out.lost = await p.$eval('#fatal h2', e => e.textContent).catch(() => null);
  await p.close();

  console.log('errors', JSON.stringify(out));
  if (out.notFound.status !== 404 || !out.notFound.title.startsWith('Out of bounds') || !out.notFound.styled) errors.push('[errors] the 404 page is missing or unstyled');
  if (!out.deadLink.msg?.includes('expired') || out.deadLink.button !== 'Go to Compete') errors.push('[errors] a dead challenge link has no way forward');
  if (out.noWebgl !== 'Your browser can’t show 3D') errors.push('[errors] no-WebGL screen missing');
  if (out.lost !== 'The graphics took a break') errors.push('[errors] context-lost screen missing');
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
