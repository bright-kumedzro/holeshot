// Brute-force solver: for every hole, simulate shots (angle x power x launch time) until one sinks.
// Also checks that ball starts, holes and coins are clear of geometry. Usage: node scripts/check-levels.mjs [endlessCount]
import { worldLevel, endlessLevel, dailyLevel, dayKey, prepareChallenge, competeLevel } from '../src/levels/index.js';
import { createWorld, poseBody } from '../src/physics.js';
import { findShot } from '../src/levels/solver.js';
import { WORLDS, HOLES_PER_WORLD, R, HOLE_R, COMPETE_HOLES } from '../src/config.js';
import { closestOnPoly, zoneContains } from '../src/geom.js';

function overlaps(W, x, z, pad) {
  for (const w of W.walls) if ((x - w.ax) * w.nx + (z - w.az) * w.nz < pad) return 'wall';
  for (const b of W.bodies) for (const p of b.parts) {
    if (p.k === 'poly') { const c = closestOnPoly(p.w, x, z); if (c.inside || c.d < pad) return 'body'; }
    else if (Math.hypot(x - p.wx, z - p.wz) < p.r + pad) return 'body';
  }
  for (const zn of W.zones) if ((zn.type === 'water' || zn.type === 'lava') && zoneContains(zn, x, z)) return zn.type;
  return null;
}
const solvable = (def, target) => { const sims = findShot(def, target); return { ok: sims >= 0, sims: sims >= 0 ? sims : 5280 }; };

function check(label, def) {
  const W = createWorld(def);
  for (const b of W.bodies) poseBody(b, 0);
  const issues = [];
  const startHit = overlaps(W, def.ball[0], def.ball[1], R + 0.02);
  if (startHit) issues.push(`ball start overlaps ${startHit}`);
  const holeHit = overlaps(W, def.hole[0], def.hole[1], HOLE_R * 0.5);
  if (holeHit && !def.holeMove) issues.push(`hole overlaps ${holeHit}`);
  for (const [cx, cz] of def.coins) { const o = overlaps(W, cx, cz, 0.2); if (o) issues.push(`coin at ${cx},${cz} overlaps ${o}`); }
  const res = solvable(def, 'hole');
  if (!res.ok) issues.push(`no sinking shot found (${res.sims} tries)`);
  (def.keys || []).forEach((_, i) => { if (!solvable(def, i).ok) issues.push(`key ${i + 1} unreachable`); });
  console.log(`${issues.length ? 'FAIL' : ' ok '}  ${label.padEnd(22)} ${issues.length ? issues.join('; ') : `sunk after ${res.sims} sims`}`);
  return issues.length === 0;
}

const endlessCount = +process.argv[2] || 12;
let bad = 0;
for (let w = 0; w < WORLDS.length; w++) for (let i = 0; i < HOLES_PER_WORLD; i++) if (!check(`${WORLDS[w].name} ${i + 1}`, worldLevel(w, i))) bad++;
if (!check(`Daily ${dayKey(0)}`, dailyLevel(dayKey(0)))) bad++;
for (let n = 1; n <= endlessCount; n++) if (!check(`Endless #${n}`, endlessLevel(12345, n))) bad++;
for (const seed of [7, 424242, 3141592653]) {
  const ks = await prepareChallenge(seed, COMPETE_HOLES);
  for (let n = 1; n <= COMPETE_HOLES; n++) if (!check(`Challenge ${seed} #${n}`, competeLevel(seed, n, ks[n - 1]))) bad++;
}
console.log(bad ? `\n${bad} hole(s) need attention` : '\nAll holes pass');
process.exit(bad ? 1 : 0);
