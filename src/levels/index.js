import { WORLDS, HOLES_PER_WORLD } from '../config.js';
import { HANDMADE } from './handmade.js';
import { generate } from './generator.js';
import { shotSearch, runSync, runSliced } from './solver.js';
import { createWorld } from '../physics.js';
import { mulberry32, hashStr, closestOnPoly, zoneContains, distToSeg } from '../geom.js';

export function dayKey(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- specs: what a hole is made from, without building it yet ----------
function worldSpec(w, i) {
  const W = WORLDS[w], hm = HANDMADE[w];
  const meta = { id: `${w}-${i}`, world: w, index: i, palette: W.palettes[i % W.palettes.length], friction: W.friction, floorStyle: W.floorStyle };
  if (i === HOLES_PER_WORLD - 1) return { meta, handmade: hm.boss };
  if (i < hm.intro.length) return { meta, handmade: hm.intro[i] };
  const diff = Math.min(1, 0.2 + 0.7 * (i / (HOLES_PER_WORLD - 1)) + w * 0.05);
  return { meta, opts: { seed: 1000 * (w + 1) + i * 37, pool: W.pool, diff, movingHole: W.movingHole || 0 } };
}
function dailySpec(key) {
  const seed = hashStr(`daily-${key}`), w = seed % WORLDS.length, W = WORLDS[w];
  return { meta: { id: `daily-${key}`, world: w, palette: W.palettes[0], friction: W.friction, floorStyle: W.floorStyle },
           opts: { seed, pool: W.pool, diff: 0.6, movingHole: W.movingHole || 0 } };
}
function endlessSpec(runSeed, n) {
  const w = Math.floor((n - 1) / 3) % WORLDS.length, W = WORLDS[w]; // a new theme every three holes
  return { meta: { id: `endless-${runSeed}-${n}`, world: w, palette: W.palettes[n % 2], friction: W.friction, floorStyle: W.floorStyle },
           opts: { seed: (runSeed + n * 7919) >>> 0, pool: W.pool, diff: Math.min(1, 0.15 + n * 0.04), movingHole: W.movingHole || 0 } };
}

// A challenge hole: each one from a different world, getting harder through the set.
function competeSpec(seed, n) {
  const w = (seed + n) % WORLDS.length, W = WORLDS[w];
  return { meta: { id: `compete-${seed}-${n}`, world: w, palette: W.palettes[n % 2], friction: W.friction, floorStyle: W.floorStyle },
           opts: { seed: (seed + n * 6151) >>> 0, pool: W.pool, diff: 0.3 + n * 0.08, movingHole: W.movingHole || 0 } };
}

// ---------- fair generation: reroll the seed until the solver finds a sinking shot ----------
const fairCache = new Map();
const pending = new Set();
const cacheKey = spec => `${spec.opts.seed}|${spec.meta.friction}|${spec.opts.diff}`;
const rerollSeed = (seed, k) => (seed + k * 104729) >>> 0;

function* fairSearch(spec) {
  for (let k = 0; ; k++) {
    const def = { ...generate({ ...spec.opts, seed: rerollSeed(spec.opts.seed, k) }), reroll: k };
    if (k === 4) return def;
    const sims = yield* shotSearch({ ...def, friction: spec.meta.friction, keys: [] }, 'hole', 300);
    if (sims >= 0) return def;
  }
}

// Challenges store the reroll each hole settled on, so every device builds identical holes without
// re-running the solver (floating-point maths can differ in the last digit between browsers).
export async function prepareChallenge(seed, count) {
  const ks = [];
  for (let n = 1; n <= count; n++) ks.push((await runSliced(fairSearch(competeSpec(seed, n)))).reroll);
  return ks;
}
export function competeLevel(seed, n, k) {
  const spec = competeSpec(seed, n);
  return finalize(generate({ ...spec.opts, seed: rerollSeed(spec.opts.seed, k) }), spec.meta);
}
function remember(key, def) {
  fairCache.set(key, def);
  if (fairCache.size > 40) fairCache.delete(fairCache.keys().next().value);
}

function build(spec) {
  let src = spec.handmade;
  if (!src) {
    const key = cacheKey(spec);
    if (!fairCache.has(key)) remember(key, runSync(fairSearch(spec)));
    src = fairCache.get(key);
  }
  return finalize(src, spec.meta);
}

// Prepares a generated hole in the background so that loading it later is instant.
function prefetchSpec(spec) {
  if (spec.handmade) return;
  const key = cacheKey(spec);
  if (fairCache.has(key) || pending.has(key)) return;
  pending.add(key);
  runSliced(fairSearch(spec)).then(def => { pending.delete(key); remember(key, def); });
}

export const worldLevel = (w, i) => build(worldSpec(w, i));
export const dailyLevel = key => build(dailySpec(key));
export const endlessLevel = (runSeed, n) => build(endlessSpec(runSeed, n));
export const prefetching = () => pending.size > 0;
export function prefetch(d) {
  if (d.mode === 'world') { if (d.w < WORLDS.length && d.i < HOLES_PER_WORLD) prefetchSpec(worldSpec(d.w, d.i)); }
  else if (d.mode === 'daily') prefetchSpec(dailySpec(d.key));
  else prefetchSpec(endlessSpec(d.seed, d.n));
}

function finalize(src, meta) {
  const def = { bodies: [], zones: [], portals: [], keys: [], ...src, ...meta };
  if (!def.coins) def.coins = placeCoins(def, hashStr(meta.id));
  return def;
}

// Drops 1-3 coins near the ball-to-hole corridor, away from walls, hazards and anything that moves.
function placeCoins(def, seed) {
  const rnd = mulberry32(seed), W = createWorld({ ...def, coins: [] });
  const n = 1 + Math.floor(rnd() * 3), out = [];
  const [bx, bz] = def.ball, [hx, hz] = def.hole;
  for (let tries = 0; tries < 80 && out.length < n; tries++) {
    const t = 0.2 + rnd() * 0.6;
    const x = bx + (hx - bx) * t + (rnd() * 2 - 1) * 1.6, z = bz + (hz - bz) * t + (rnd() * 2 - 1) * 0.6;
    if (!isFree(W, x, z)) continue;
    if (out.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 0.9)) continue;
    out.push([+x.toFixed(2), +z.toFixed(2)]);
  }
  return out;
}

function isFree(W, x, z) {
  const def = W.def;
  for (const w of W.walls) if ((x - w.ax) * w.nx + (z - w.az) * w.nz < 0.4) return false;
  if (Math.hypot(x - def.hole[0], z - def.hole[1]) < 0.8) return false;
  if (def.holeMove && Math.abs(z - def.hole[1]) < 0.7) return false;
  if (Math.hypot(x - def.ball[0], z - def.ball[1]) < 0.8) return false;
  for (const k of W.keys) if (Math.hypot(x - k.x, z - k.z) < 0.7) return false;
  for (const p of W.portals) for (const e of p.ends) if (Math.hypot(x - e.x, z - e.z) < 0.7) return false;
  for (const zn of W.zones) if ((zn.type === 'water' || zn.type === 'lava') && zoneContains(zn, x, z, 0.35)) return false;
  for (const b of W.bodies) {
    let br = 0;
    for (const p of b.parts) {
      if (p.k === 'poly') for (const [px, pz] of p.pts) br = Math.max(br, Math.hypot(px, pz));
      else br = Math.max(br, Math.hypot(p.x, p.z) + p.r);
    }
    if (b.spin) { if (Math.hypot(x - b.x, z - b.z) < br + 0.35) return false; continue; }
    if (b.move) {
      const m = b.move, dz = m.dz || 0;
      if (distToSeg(x, z, b.x - m.dx * m.amp, b.z - dz * m.amp, b.x + m.dx * m.amp, b.z + dz * m.amp) < br + 0.35) return false;
      continue;
    }
    for (const p of b.parts) {
      if (p.k === 'poly') { const c = closestOnPoly(p.w, x, z); if (c.inside || c.d < 0.35) return false; }
      else if (Math.hypot(x - p.wx, z - p.wz) < p.r + 0.35) return false;
    }
  }
  return true;
}
