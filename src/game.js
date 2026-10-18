import { View } from './render/view.js';
import { createWorld, step, poseBody, updateHole, castPath } from './physics.js';
import { worldLevel, dailyLevel, endlessLevel, competeLevel, dayKey, prefetch, prefetching } from './levels/index.js';
import { save, persist, resetSave, worldUnlocked, levelKey } from './save.js';
import { initAudio, applyAudio, suspendAudio, sfx, loadTracks, musicChoices, musicChoice, setExternalChoices } from './audio.js';
import * as YouTube from './youtube.js';
import * as UI from './ui.js';
import * as Compete from './compete.js';
import { R, HOLE_R, HOLES_PER_WORLD, COIN_VALUE, STAR_VALUE, DAILY_REWARD, ENDLESS_BALLS, SKIP_AFTER, WORLDS, PHYS_H, QUALITY, COMPETE_HOLES, COMPETE_MAX_TRIES, COMPETE_REWARD } from './config.js';

const view = new View(document.getElementById('stage'));
const hudEl = document.getElementById('hud');
const ball = { x: 0, z: 0, vx: 0, vz: 0, minDist: 9, inBoost: false };
const G = {
  desc: null, def: null, W: null, state: 'menu', attempts: 0, combo: 0,
  gt: 0, timeScale: 1, rollTime: 0, coinsHole: 0, run: null, pausedFrom: null,
  nearArmed: false, nearShown: false, pendingCapture: false, pendingHazard: null,
};
const pick = a => a[Math.floor(Math.random() * a.length)];
let nextRunSeed = (Math.random() * 1e9) >>> 0; // chosen early so the first endless hole can be prepared ahead
const easeOutBack = t => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const playing = () => ['intro', 'aim', 'roll', 'miss', 'sink', 'won'].includes(G.state);

// ---------- tweens: all cancelled together when a new flow starts (new hole, menu, restart) ----------
let tweens = [], flow = 0;
const tween = (dur, fn, done) => tweens.push({ id: flow, t: 0, dur, fn, done });
function runTweens(dt) {
  const list = tweens; tweens = [];
  for (const tw of list) {
    if (tw.id !== flow) continue;
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    if (tw.fn) tw.fn(k);
    if (k < 1) tweens.push(tw); else if (tw.done) tw.done();
  }
}
function slowmo(scale, dur) {
  G.timeScale = scale;
  tween(dur, k => { G.timeScale = scale + (1 - scale) * k * k; });
}
function haptic(ms) {
  if (!save.settings.haptics || !navigator.vibrate) return;
  try { navigator.vibrate(ms); } catch (e) { /* not allowed here */ }
}

// ---------- graphics quality: a fixed tier, or auto, which steps down while frames run slow ----------
const perf = { times: [], fpsFrames: 0, fpsSince: 0 };
function applyQuality() {
  const g = save.settings.graphics;
  const q = QUALITY[g === 'high' ? 0 : g === 'low' ? QUALITY.length - 1 : Math.min(save.autoQuality, QUALITY.length - 1)];
  view.setQuality(q);
  document.body.classList.toggle('lowfx', !q.blur);
  perf.times.length = 0;
  fitView();
}
function sampleFrame(ms) {
  if (save.settings.graphics !== 'auto' || save.autoQuality >= QUALITY.length - 1) return;
  if (ms > 100 || prefetching()) return; // hitches and background level searches say nothing about the GPU
  perf.times.push(ms);
  if (perf.times.length < 120) return;
  const median = perf.times.sort((a, b) => a - b)[60];
  perf.times.length = 0;
  if (median > 21) { save.autoQuality++; persist(); applyQuality(); } // slower than ~48 fps
}
function meterFps(now) {
  if (!save.settings.fps) return;
  perf.fpsFrames++;
  const span = now - perf.fpsSince;
  if (span < 500) return;
  UI.fps(`${Math.round((perf.fpsFrames * 1000) / span)} fps · ${view.renderer.getPixelRatio()}x`);
  perf.fpsFrames = 0; perf.fpsSince = now;
}
function settingsChanged(key) {
  if (key === 'graphics') { if (save.settings.graphics === 'auto') { save.autoQuality = 0; persist(); } applyQuality(); }
  if (key === 'fps') { perf.fpsFrames = 0; perf.fpsSince = performance.now(); UI.fps(save.settings.fps ? '…' : null); }
  applyMusic();
}

// ---------- level loading ----------
function levelFor(d) {
  if (d.mode === 'world') return worldLevel(d.w, d.i);
  if (d.mode === 'daily') return dailyLevel(d.key);
  if (d.mode === 'compete') return competeLevel(d.seed, d.n, d.ks[d.n - 1]);
  return endlessLevel(G.run.seed, d.n);
}
const coinKey = d => (d.mode === 'world' ? levelKey(d.w, d.i) : d.mode === 'daily' ? `daily-${d.key}` : null);

function fitView() {
  const top = hudEl.hidden ? 76 : Math.max(76, hudEl.getBoundingClientRect().bottom + 10);
  // on portrait screens the YouTube dock sits under the course, so the course is fitted above it
  const dockTop = YouTube.docked() && innerWidth < innerHeight ? document.getElementById('ytDock').getBoundingClientRect().top : innerHeight;
  view.fit(G.W, top, Math.max(70, innerHeight - dockTop + 10));
}

// ---------- music: off, the built-in theme, Pixabay tracks, or a YouTube link ----------
let ytLink = ''; // the link the dock is playing, so re-applying settings doesn't restart it
function applyMusic() {
  applyAudio();
  YouTube.setMuted(!save.settings.sound); // the speaker silences everything, YouTube included
  const link = musicChoice() === 'youtube' && YouTube.parse(save.settings.youtube) ? save.settings.youtube : '';
  if (link === ytLink) return;
  ytLink = link;
  if (link) YouTube.play(YouTube.parse(link)).catch(e => { ytLink = ''; UI.toast(e.message); });
  else YouTube.stop();
}
function setMusic(id) {
  save.settings.music = id !== 'off';
  if (id !== 'off') save.settings.track = id;
  persist(); initAudio(); applyMusic(); UI.refreshMusic();
}
function playYouTube(text) {
  if (!YouTube.parse(text)) { UI.toast('That doesn’t look like a YouTube link'); return; }
  save.settings.youtube = text.trim();
  setMusic('youtube');
}

function loadCourse(d) {
  flow++;
  G.desc = d;
  G.def = levelFor(d);
  const ck = coinKey(d);
  G.W = createWorld(G.def, ck ? save.coinsTaken[ck] || 0 : 0);
  view.build(G.W);
  document.body.style.backgroundColor = G.def.palette.bg;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', G.def.palette.bg);
  G.attempts = 0; G.coinsHole = 0; G.timeScale = 1;
  G.pendingCapture = false; G.pendingHazard = null;
  for (const b of G.W.bodies) poseBody(b, G.gt);
  updateHole(G.W, G.gt);
  view.hideAim(); view.trail.reset();
  const [x, z] = G.def.ball;
  Object.assign(ball, { x, z, vx: 0, vz: 0, minDist: 9, inBoost: false });
  view.placeBall(x, z); view.ball.scale.setScalar(1); view.ball.visible = true;
}

function continueTarget() {
  for (let w = 0; w < WORLDS.length; w++) {
    if (!worldUnlocked(w)) break;
    for (let i = 0; i < HOLES_PER_WORLD; i++) if (!save.done[levelKey(w, i)]) return { w, i };
  }
  return null;
}

function goMenu(screen = 'scrTitle') {
  UI.closeModals(); UI.setPlaying(false);
  const c = continueTarget() || { w: WORLDS.length - 1, i: HOLES_PER_WORLD - 1 };
  loadCourse({ mode: 'world', ...c });
  G.state = 'menu';
  fitView();
  UI.showScreen(screen);
  prefetch({ mode: 'daily', key: dayKey(0) });
  prefetch({ mode: 'endless', seed: nextRunSeed, n: 1 });
}

function startHole(d) {
  UI.showScreen(null); UI.closeModals(); UI.setPlaying(true);
  loadCourse(d);
  if (d.mode === 'compete') G.attempts = Compete.progress(d.id).tries; // resume mid-hole after leaving
  refreshHud();
  UI.barFill(0); UI.showSkip(false);
  UI.hint(G.def.hint || (G.def.boss ? 'Boss hole: keys stay collected between tries' : ''));
  fitView();
  G.state = 'intro';
  view.ball.visible = false;
  // get the following hole ready in the background while this one is played
  if (d.mode === 'world') prefetch(d.i < HOLES_PER_WORLD - 1 ? { mode: 'world', w: d.w, i: d.i + 1 } : { mode: 'world', w: d.w + 1, i: 0 });
  else if (d.mode === 'endless') prefetch({ mode: 'endless', seed: G.run.seed, n: d.n + 1 });
  const g = view.course;
  g.scale.setScalar(0.88); g.position.y = -0.4;
  tween(0.5, t => { const e = easeOutBack(t); g.scale.setScalar(0.88 + 0.12 * e); g.position.y = -0.4 * (1 - e); }, spawnBall);
}

function spawnBall() {
  G.state = 'intro';
  const [x, z] = G.def.ball;
  Object.assign(ball, { x, z, vx: 0, vz: 0, minDist: 9, inBoost: false });
  view.trail.reset();
  view.placeBall(x, z);
  view.ball.visible = true;
  view.ball.scale.setScalar(0.01);
  tween(0.28, t => view.ball.scale.setScalar(Math.max(0.01, easeOutBack(t))), () => { G.state = 'aim'; });
}

// ---------- HUD ----------
function starsFor(tries, boss) { return boss ? (tries <= 3 ? 3 : tries <= 5 ? 2 : 1) : (tries === 1 ? 3 : tries <= 3 ? 2 : 1); }

function refreshHud() {
  const d = G.desc, def = G.def;
  if (d.mode === 'world') {
    const last = HOLES_PER_WORLD - 1, W = WORLDS[d.w];
    const label = def.boss ? `Boss · ${def.name}` : W.name;
    const next = d.i < last ? (d.i + 1 === last ? UI.ICONS.crown : String(d.i + 2)) : d.w + 1 < WORLDS.length ? `W${d.w + 2}` : UI.ICONS.trophy;
    UI.hudTrack(label, def.boss ? UI.ICONS.crown : String(d.i + 1), next, { aBoss: def.boss, bBoss: d.i + 1 === last });
  } else if (d.mode === 'daily') {
    UI.hudTrack('Daily hole', String(new Date().getDate()), UI.ICONS.trophy);
  } else if (d.mode === 'compete') {
    UI.hudTrack(d.by ? `vs ${d.by}` : 'Your challenge', String(d.n), d.n < COMPETE_HOLES ? String(d.n + 1) : UI.ICONS.trophy);
  } else {
    UI.hudTrack(`Endless · ${WORLDS[def.world].name}`, String(d.n), String(d.n + 1));
  }
  const compete = d.mode === 'compete';
  UI.hudSub({
    stars: d.mode === 'endless' || compete ? null : starsFor(G.attempts + 1, !!def.boss),
    keys: G.W.keys.length ? { total: G.W.keys.length, got: G.W.keys.filter(k => k.taken).length } : null,
    balls: d.mode === 'endless' ? { left: G.run.balls, max: ENDLESS_BALLS } : null,
    shots: compete ? Compete.progress(d.id).holes.reduce((a, b) => a + b, 0) + G.attempts : null,
  });
}

// ---------- shooting ----------
let drag = null;
const canvas = view.canvas;
canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (G.state !== 'aim' || drag || UI.anyScreenOpen()) return;
  const w = view.rayFloor(e.clientX, e.clientY);
  if (!w) return;
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, w0: w, dx: 0, dz: -1, power: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (G.state !== 'aim') { drag = null; view.hideAim(); return; }
  const w = view.rayFloor(e.clientX, e.clientY);
  if (w) {
    const dx = drag.w0.x - w.x, dz = drag.w0.z - w.z, l = Math.hypot(dx, dz);
    if (l > 1e-3) { drag.dx = dx / l; drag.dz = dz / l; }
  }
  const pix = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
  drag.power = Math.min(1, pix / (Math.min(window.innerWidth, window.innerHeight) * 0.36));
  if (drag.power > 0.05) {
    const len = 0.6 + drag.power * 3.8;
    const pts = save.settings.preview
      ? castPath(G.W, ball.x, ball.z, drag.dx, drag.dz, len)
      : [[ball.x, ball.z], [ball.x + drag.dx * len, ball.z + drag.dz * len]];
    view.showAim(pts, drag.power);
  } else view.hideAim();
});
const endDrag = (e, fire) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  if (fire && G.state === 'aim' && d.power > 0.05) shoot(d.dx, d.dz, d.power); else view.hideAim();
};
canvas.addEventListener('pointerup', e => endDrag(e, true));
canvas.addEventListener('pointercancel', e => endDrag(e, false));

function shoot(dx, dz, power) {
  const speed = 1.5 + 13 * Math.pow(power, 1.15);
  ball.vx = dx * speed; ball.vz = dz * speed; ball.minDist = 9;
  G.state = 'roll'; G.rollTime = 0; G.nearArmed = false; G.nearShown = false;
  physAcc = 0; simT = G.gt;
  view.hideAim(); view.squash();
  sfx.hit(power); haptic(12);
  save.stats.shots++;
  // a challenge shot counts the moment it's taken, so quitting mid-roll can't undo a bad one
  if (G.desc.mode === 'compete') { Compete.progress(G.desc.id).tries = G.attempts + 1; persist(); }
}

// ---------- physics events ----------
const EV = {
  bounce(v, x, z, kind) {
    if (kind === 'bumper') { sfx.bumper(); view.shakeIt(0.08); haptic(15); view.particles.burst('spark', x, 0.2, z, '#FF2E88'); return; }
    if (v > 0.6) sfx.bounce(v);
    if (v > 2) view.particles.burst('dust', x, 0.1, z);
    if (v > 7) { view.shakeIt(Math.min(0.09, v * 0.007)); haptic(8); }
  },
  hazard(type) { G.pendingHazard = type; },
  boost() { sfx.boost(); view.particles.burst('boost', ball.x, 0.1, ball.z); },
  portal(a, b, p) {
    sfx.portal(); haptic(10);
    view.particles.burst('portal', a.x, 0.15, a.z, p.color);
    view.particles.burst('portal', b.x, 0.15, b.z, p.color);
    view.trail.reset();
  },
  coin(i, c) {
    sfx.coin(); haptic(6);
    view.particles.burst('coin', c.x, 0.3, c.z);
    G.coinsHole += COIN_VALUE;
    save.coins += COIN_VALUE;
    const ck = coinKey(G.desc);
    if (ck) save.coinsTaken[ck] = (save.coinsTaken[ck] || 0) | (1 << i);
    persist();
    const p = view.project(c.x, 0.3, c.z);
    UI.flyCoin(p.x, p.y, () => UI.setCoins(save.coins, true));
  },
  key(k) { sfx.key(); haptic(10); view.particles.burst('coin', k.x, 0.35, k.z); refreshHud(); },
  unlock() { sfx.unlock(); view.particles.burst('unlock', G.W.hx, 0.1, G.W.hz); UI.toast('The cup is open!'); },
  capture() { G.pendingCapture = true; },
};

// ---------- outcomes ----------
function loseBall() {
  if (G.desc.mode !== 'endless') return false;
  G.run.balls--;
  refreshHud();
  if (G.run.balls > 0) return false;
  tween(1.0, null, runOver);
  return true;
}

function afterMiss() {
  refreshHud();
  if (G.desc.mode === 'compete') {
    if (G.attempts >= COMPETE_MAX_TRIES) {
      UI.hint(`Out of tries: this hole counts as ${COMPETE_MAX_TRIES + 1}`);
      competeHoleDone(COMPETE_MAX_TRIES + 1);
      return;
    }
    UI.hint(`Try ${G.attempts + 1} of ${COMPETE_MAX_TRIES}`);
  } else UI.hint(`Try ${G.attempts + 1}`);
  if (G.desc.mode === 'world' && G.attempts >= SKIP_AFTER) UI.showSkip(true);
  tween(0.75, null, () => tween(0.18, t => view.ball.scale.setScalar(Math.max(0.01, 1 - t)), spawnBall));
}

function missed() {
  G.state = 'miss'; G.attempts++; G.combo = 0;
  sfx.miss();
  const close = ball.minDist < HOLE_R + 0.45 && !G.W.locked;
  if (loseBall()) { UI.banner('Out of balls', true); return; }
  UI.banner(close ? 'So close!' : pick(['Try again', 'Nearly', 'Go again']), true);
  afterMiss();
}

function hazardFail(type) {
  G.state = 'miss'; G.attempts++; G.combo = 0;
  sfx.splash(type); haptic(25);
  view.particles.burst('splash', ball.x, 0.1, ball.z, type === 'lava' ? '#FF7A1A' : '#5CC0FF');
  tween(0.3, t => { view.ball.position.y = R - t * 0.45; view.ball.scale.setScalar(Math.max(0.01, 1 - t * 0.6)); }, () => { view.ball.visible = false; });
  if (loseBall()) { UI.banner('Out of balls', true); return; }
  UI.banner(type === 'lava' ? 'Toasted!' : 'Splash!', true);
  afterMiss();
}

function capture() {
  G.state = 'sink';
  sfx.hole(); haptic(30);
  slowmo(0.3, 0.7);
  const sx = ball.x, sz = ball.z;
  tween(0.32, t => {
    const k = Math.min(1, t * 1.7);
    view.ball.position.set(sx + (G.W.hx - sx) * k, R - t * t * 0.75, sz + (G.W.hz - sz) * k);
  }, () => { view.ball.visible = false; win(); });
}

function win() {
  G.state = 'won';
  const d = G.desc, tries = G.attempts + 1, boss = !!G.def.boss, ace = tries === 1;
  const stars = starsFor(tries, boss);
  if (ace) G.combo++; else G.combo = 0;
  save.stats.holes++;
  if (ace) save.stats.aces++;

  const lines = [];
  let earned = 0, note = '';
  if (G.coinsHole) lines.push(['Coins picked up', G.coinsHole]);
  if (d.mode === 'world') {
    const id = levelKey(d.w, d.i), prev = save.stars[id] || 0, firstClear = !save.done[id];
    if (stars > prev) {
      const c = (stars - prev) * STAR_VALUE;
      earned += c; lines.push([`${stars - prev} new star${stars - prev > 1 ? 's' : ''}`, c]);
      save.stars[id] = stars;
    }
    save.done[id] = true;
    if (boss && firstClear) note = d.w + 1 < WORLDS.length ? `${WORLDS[d.w + 1].name} unlocked!` : 'You cleared every world!';
  } else if (d.mode === 'daily') {
    if (save.daily.done[d.key] == null) {
      earned += DAILY_REWARD; lines.push(['Daily reward', DAILY_REWARD]);
      save.daily.streak = save.daily.last === dayKey(-1) ? save.daily.streak + 1 : 1;
      save.daily.last = d.key;
      save.daily.done[d.key] = stars;
    } else save.daily.done[d.key] = Math.max(save.daily.done[d.key], stars);
    note = `Daily streak: ${save.daily.streak} day${save.daily.streak === 1 ? '' : 's'}`;
  } else if (d.mode === 'endless') {
    G.run.holes++; G.run.coins += 2 + G.coinsHole; earned += 2;
    if (ace && G.run.balls < ENDLESS_BALLS) { G.run.balls++; UI.toast('Hole in one: +1 ball'); }
  }
  if (ace && G.combo >= 2) { const c = 5 * G.combo; earned += c; lines.push([`Combo x${G.combo}`, c]); }
  save.coins += earned;
  persist();
  UI.setCoins(save.coins, earned > 0);

  view.particles.burst('confetti', G.W.hx, 0.1, G.W.hz);
  UI.banner(ace ? pick(['AWESOME!', 'PERFECT!', 'HOLE IN ONE!', 'SWEET!']) : pick(['NICE!', 'GOT IT!', 'THERE IT IS!']));
  if (ace && G.combo >= 2) { UI.combo(G.combo); sfx.combo(G.combo); }
  UI.barFill(100);
  refreshHud();

  if (d.mode === 'endless') { tween(1.4, null, () => startHole({ mode: 'endless', n: d.n + 1 })); return; }
  if (d.mode === 'compete') { competeHoleDone(tries); return; }
  const nextLabel = d.mode === 'daily' ? 'Main menu'
    : d.i < HOLES_PER_WORLD - 1 ? 'Next hole'
    : d.w + 1 < WORLDS.length ? `Go to ${WORLDS[d.w + 1].name}` : 'Main menu';
  tween(1.1, null, () => UI.showResult({
    eyebrow: d.mode === 'world' ? `${WORLDS[d.w].name} · Hole ${d.i + 1}` : `Daily hole · ${d.key}`,
    title: boss ? 'Boss beaten!' : ace ? 'Hole in one!' : `Sunk in ${tries}`,
    stars, lines, total: earned + G.coinsHole, note, nextLabel,
  }));
}

function runOver() {
  const r = G.run, isBest = r.holes > save.endlessBest;
  if (isBest) save.endlessBest = r.holes;
  persist();
  G.state = 'menu';
  UI.showRunOver({ holes: r.holes, best: save.endlessBest, isBest, coins: r.coins });
}

function nextFromResult() {
  const d = G.desc;
  if (d.mode !== 'world') return goMenu();
  if (d.i < HOLES_PER_WORLD - 1) return startHole({ mode: 'world', w: d.w, i: d.i + 1 });
  if (d.w + 1 < WORLDS.length) return startHole({ mode: 'world', w: d.w + 1, i: 0 });
  goMenu();
}

function startEndless() {
  G.run = { seed: nextRunSeed, balls: ENDLESS_BALLS, holes: 0, coins: 0 };
  nextRunSeed = (Math.random() * 1e9) >>> 0;
  startHole({ mode: 'endless', n: 1 });
}

// ---------- compete ----------
let chToken = 0; // bumped on every navigation, so a slow reply can't redraw a screen the player has left
const reopen = screen => { if (G.state === 'menu') UI.showScreen(screen); else goMenu(screen); };
const sum = a => a.reduce((x, y) => x + y, 0);
const names = n => (n.length === 1 ? n[0] : n.length === 2 ? `${n[0]} and ${n[1]}` : `${n[0]} and ${n.length - 1} others`);

function competeList(summaries = []) {
  const byId = Object.fromEntries(summaries.map(s => [s.id, s]));
  return Compete.recent().map(([id, rec]) => {
    const s = byId[id];
    const others = !s || s.gone ? '' : s.joined.length ? `${names(s.joined)} joined · ${s.done} finished` : 'Nobody has joined yet';
    const you = !Compete.finished(rec) ? (rec.holes.length || rec.tries ? `You’re on hole ${rec.holes.length + 1} of ${COMPETE_HOLES}` : 'You haven’t played yet')
      : !rec.sent ? 'You finished · score not sent yet'
      : `You took ${sum(rec.holes)} shots${s?.rank && s.of > 1 ? ` · ${UI.ordinal(s.rank)} of ${s.of}` : ''}`;
    return { id, title: rec.by ? `${rec.by}’s challenge` : 'Your challenge', others, you, fresh: !!s?.fresh };
  });
}

// Keeps a compete view live: re-runs `refresh` (which resolves true when something changed) every few seconds
// while that screen is showing, easing off after a minute without news, and pausing while the game is hidden.
// Navigating away (which bumps chToken) or starting to play (which hides the screen) stops it.
const LIVE_FAST = 4000, LIVE_SLOW = 12000, LIVE_QUIET = 15;
function keepFresh(t, screenId, refresh) {
  let quiet = 0;
  const tick = async () => {
    if (t !== chToken || document.getElementById(screenId).hidden) return;
    if (!document.hidden) quiet = (await refresh().catch(() => false)) ? 0 : quiet + 1;
    if (t === chToken) setTimeout(tick, quiet > LIVE_QUIET ? LIVE_SLOW : LIVE_FAST);
  };
  setTimeout(tick, LIVE_FAST);
}
// coming back to the game refreshes the live view straight away rather than waiting out an interval
let liveNudge = null;
document.addEventListener('visibilitychange', () => { if (!document.hidden) liveNudge?.(); });

function openCompete() {
  reopen('scrCompete');
  Compete.warmUp();
  const t = ++chToken;
  let stats = null, sums = [], last = '';
  const draw = () => { if (t === chToken) UI.renderCompete(stats, competeList(sums)); };
  const loadStats = () => Compete.fetchStats().then(s => { stats = s; draw(); }, e => { stats = stats || { error: e.message }; draw(); });
  const loadSums = async () => {
    sums = await Compete.fetchSummaries();
    const key = JSON.stringify(sums);
    if (key === last) return false;
    if (last) loadStats(); // someone finished or joined: the record may have moved too
    last = key; draw();
    return true;
  };
  draw();
  loadStats(); loadSums().catch(() => {});
  keepFresh(t, 'scrCompete', loadSums);
  liveNudge = () => { if (t === chToken) loadSums().catch(() => {}); };
}

// Badge on the title screen's Compete tile when someone has joined or finished one of your challenges.
// Kept live while the title screen shows.
function refreshCompeteBadge() {
  if (!Compete.available() || !Compete.recent().length) return;
  const t = ++chToken;
  let last = -1;
  const check = async () => {
    const n = (await Compete.fetchSummaries()).filter(s => s.fresh).length;
    if (t !== chToken || n === last) return false;
    last = n; UI.competeBadge(n);
    return true;
  };
  check().catch(() => {});
  keepFresh(t, 'scrTitle', check);
  liveNudge = () => { if (t === chToken) check().catch(() => {}); };
}

function needName(fieldId) {
  if (save.player.name.trim()) return false;
  UI.toast('Add your name first');
  document.getElementById(fieldId)?.focus();
  return true;
}

let creating = false;
async function newChallenge() {
  if (creating) return;
  if (!save.player.name.trim()) { openCompete(); needName('cmpName'); return; }
  creating = true;
  reopen('scrChallenge');
  const t = ++chToken;
  UI.renderChallenge({ message: `Setting up ${COMPETE_HOLES} holes…` });
  // a new challenge opens on its invite screen: share it now, play your own holes whenever you like
  try { const ch = await Compete.createChallenge(); if (t === chToken) showChallenge(ch, t); }
  catch (e) { if (t === chToken) UI.renderChallenge({ error: e.message }); }
  finally { creating = false; }
}

async function openChallenge(id) {
  reopen('scrChallenge');
  const t = ++chToken;
  UI.renderChallenge({ message: 'Loading challenge…' });
  try {
    const rec = Compete.progress(id);
    const view = rec && Compete.finished(rec) && !rec.sent ? await Compete.submitScore(id) : await Compete.fetchChallenge(id);
    if (t === chToken) showChallenge(view, t);
  } catch (e) { if (t === chToken) UI.renderChallenge({ error: e.message, id }); }
}

function showChallenge(view, t) {
  let shown = '';
  const draw = v => {
    const key = JSON.stringify([v.players, v.playing]);
    // no news, or the player is typing their name: leave the screen alone (it redraws on the next change)
    if (key === shown || document.querySelector('#chBody input:focus')) return false;
    shown = key;
    UI.renderChallenge({ view: v, local: Compete.progress(v.id), playable: Compete.playable(v), link: Compete.link(v.id) });
    Compete.markSeen(v);
    return true;
  };
  draw(view);
  const refresh = async () => { const v = await Compete.fetchChallenge(view.id); return t === chToken && draw(v); };
  keepFresh(t, 'scrChallenge', refresh);
  liveNudge = () => { if (t === chToken) refresh().catch(() => {}); };
}

function playChallenge(view) {
  if (needName('chName')) return;
  const rec = Compete.track(view);
  if (!rec.joined) Compete.joinChallenge(view.id).then(() => { rec.joined = true; persist(); }, () => {}); // tells the creator
  if (rec.tries >= COMPETE_MAX_TRIES) { rec.holes.push(COMPETE_MAX_TRIES + 1); rec.tries = 0; persist(); } // left during the last try
  if (Compete.finished(rec)) { openChallenge(view.id); return; }
  startHole({ mode: 'compete', id: view.id, seed: view.seed, ks: view.ks, by: view.mine ? null : view.by, n: rec.holes.length + 1 });
}

// Records the hole straight away (so leaving during the pause loses nothing), then moves on after a beat.
function competeHoleDone(score) {
  const d = G.desc, rec = Compete.progress(d.id);
  rec.holes.push(score); rec.tries = 0;
  const done = Compete.finished(rec);
  if (done && !rec.rewarded) {
    rec.rewarded = true; save.coins += COMPETE_REWARD;
    UI.setCoins(save.coins, true); UI.toast(`Challenge done: +${COMPETE_REWARD} coins`);
  }
  persist();
  tween(1.4, null, () => (done ? openChallenge(d.id) : startHole({ ...d, n: d.n + 1 })));
}

async function shareChallenge(view) {
  const r = await Compete.share(view);
  if (r === 'copied') UI.toast('Invite link copied. Paste it to your friends');
  else if (r === 'failed') UI.toast('Copy the link below to share it');
}

function pause() {
  if (!playing() || G.state === 'paused') return;
  drag = null; view.hideAim();
  G.pausedFrom = G.state; G.state = 'paused';
  const restart = document.getElementById('btnRestart');
  restart.textContent = G.desc.mode === 'endless' ? 'New run' : 'Restart hole';
  restart.hidden = G.desc.mode === 'compete'; // tries in a challenge stick; leaving and coming back resumes
  UI.openModal('mdlPause');
}
function resume() { if (G.state !== 'paused') return; G.state = G.pausedFrom; UI.closeModals(); }

// ---------- main loop ----------
let last = performance.now(), physAcc = 0, simT = 0;
function frame(now) {
  const ms = now - last;
  const rdt = Math.min(0.033, ms / 1000);
  last = now;
  const paused = G.state === 'paused';
  if (!paused) { runTweens(rdt); sampleFrame(ms); }
  meterFps(now);
  const dt = paused ? 0 : rdt * G.timeScale;
  G.gt += dt;
  const W = G.W;
  if (W && G.state === 'roll') {
    // fixed steps (slow motion just feeds in less time), so 60 Hz and 120 Hz phones see the same shot
    physAcc += dt;
    while (physAcc >= PHYS_H - 1e-9) {
      physAcc -= PHYS_H; simT += PHYS_H;
      if (!step(W, ball, PHYS_H, simT, EV)) break;
    }
    if (G.pendingCapture) { G.pendingCapture = false; capture(); }
    else if (G.pendingHazard) { const t = G.pendingHazard; G.pendingHazard = null; hazardFail(t); }
    else {
      view.placeBall(ball.x, ball.z, true);
      G.rollTime += dt;
      const dHole = Math.hypot(ball.x - W.hx, ball.z - W.hz);
      if (!W.locked && dHole < HOLE_R + 0.06) G.nearArmed = true;
      if (G.nearArmed && !G.nearShown && dHole > HOLE_R + 0.35) { G.nearShown = true; UI.banner('Ooh!', true); sfx.ooh(); slowmo(0.45, 0.5); }
      if (Math.hypot(ball.vx, ball.vz) < 0.05 || G.rollTime > 15) missed();
    }
  } else if (W && !paused) {
    for (const b of W.bodies) poseBody(b, G.gt);
    updateHole(W, G.gt);
  }
  view.update(rdt, dt, G.gt, W, ball, G.state === 'roll');
  const showHand = G.state === 'aim' && !drag && save.stats.shots === 0 && G.desc?.mode === 'world' && G.desc.w === 0 && G.desc.i === 0;
  if (showHand) { const p = view.project(ball.x, R, ball.z); UI.hand(true, p.x, p.y); } else UI.hand(false);
  view.render();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
export function boot() {
  UI.initUI({
    play: () => { const c = continueTarget(); if (c) startHole({ mode: 'world', ...c }); else startEndless(); },
    daily: () => startHole({ mode: 'daily', key: dayKey(0) }),
    endless: startEndless,
    today: () => dayKey(0),
    startWorldHole: (w, i) => startHole({ mode: 'world', w, i }),
    pause, resume,
    restart: () => { if (G.desc.mode === 'endless') startEndless(); else startHole(G.desc); },
    toLevels: () => goMenu('scrLevels'),
    home: () => goMenu('scrTitle'),
    skip: () => {
      const d = G.desc;
      if (d.mode !== 'world' || !playing()) return;
      save.done[levelKey(d.w, d.i)] = true; persist();
      UI.toast('Skipped. Come back for the stars');
      nextFromResult();
    },
    resultNext: nextFromResult,
    resultReplay: () => startHole(G.desc),
    shopAction: (tab, it) => {
      if (save.owned[tab].includes(it.id)) { save.equip[tab] = it.id; }
      else if (save.coins >= it.price) {
        save.coins -= it.price; save.owned[tab].push(it.id); save.equip[tab] = it.id;
        sfx.buy(); UI.setCoins(save.coins, true); UI.toast(`${it.name} unlocked`);
      } else { sfx.nope(); UI.toast(`You need ${it.price - save.coins} more coins`); return; }
      persist();
      if (tab === 'ball') view.setSkin(it.id); else view.setTrail(it.id);
      UI.renderShop();
    },
    settingsChanged,
    resetProgress: () => {
      resetSave();
      view.setSkin(save.equip.ball); view.setTrail(save.equip.trail);
      UI.setCoins(save.coins); applyMusic(); applyQuality(); UI.fps(null);
      UI.toast('Progress erased');
      goMenu('scrTitle');
    },
    click: () => sfx.click(),
    starSound: k => sfx.star(k),
    competeAvailable: Compete.available(),
    openCompete, newChallenge, openChallenge, playChallenge, shareChallenge,
    setName: v => { save.player.name = v.slice(0, 16); persist(); },
    musicChoices, musicChoice, setMusic, playYouTube,
    titleShown: refreshCompeteBadge,
  });
  setExternalChoices(YouTube.available() ? [{ id: 'youtube', name: 'YouTube video or playlist' }] : []);
  YouTube.onDockChange(fitView);
  YouTube.onPlayError(msg => { UI.toast(msg); ytLink = ''; }); // so the same link can be retried
  loadTracks().then(() => { applyMusic(); UI.refreshMusic(); });
  UI.setCoins(save.coins);
  view.setSkin(save.equip.ball);
  view.setTrail(save.equip.trail);
  applyQuality();
  if (save.settings.fps) UI.fps('…');
  // touch pointerdown doesn't count as a user gesture for audio; pointerup and touchend do (iOS needs one of them)
  for (const ev of ['pointerdown', 'pointerup', 'touchend']) document.addEventListener(ev, initAudio);
  document.addEventListener('keydown', e => {
    initAudio();
    if (e.key === 'Escape') { if (G.state === 'paused') resume(); else pause(); }
  });
  document.addEventListener('visibilitychange', () => {
    suspendAudio(document.hidden);
    if (document.hidden && (G.state === 'aim' || G.state === 'roll')) pause();
  });
  window.addEventListener('resize', fitView);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitView);
  goMenu('scrTitle');
  // The smoke test sinks holes through this (a shot counts, then the ball drops in). Only with #autotest in the URL;
  // it gives nothing a cheater couldn't already do by posting a score to the API directly.
  if (location.hash === '#autotest') {
    window.__holeshot = { sink: () => { if (G.state !== 'aim') return false; shoot(0, -1, 0.06); G.pendingCapture = true; return true; } };
  }
  // challenge links (/c/<id>) land here as /?challenge=<id>
  const invite = new URLSearchParams(location.search).get('challenge');
  if (invite && Compete.available()) { history.replaceState(null, '', location.pathname); openChallenge(invite); }
  requestAnimationFrame(t => { last = t; frame(t); });
}
