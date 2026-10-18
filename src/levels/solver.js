import { createWorld, step } from '../physics.js';

const H = 1 / 240;

// Simulates one shot. target is 'hole' or a key index; returns true when the shot reaches it.
export function simulateShot(def, angle, power, t0, target = 'hole') {
  const W = createWorld(def);
  W.locked = target !== 'hole';
  const speed = 1.5 + 13 * Math.pow(power, 1.15);
  const ball = { x: def.ball[0], z: def.ball[1], vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, minDist: 9, inBoost: false };
  let done = null;
  const ev = {
    bounce() {}, boost() {}, portal() {}, coin() {}, unlock() {},
    hazard() { done = 'fail'; },
    capture() { done = 'hole'; },
    key(k) { if (W.keys.indexOf(k) === target) done = 'key'; },
  };
  for (let t = 0; t < 14; t += H) {
    if (!step(W, ball, H, t0 + t, ev) || done) break;
    if (Math.hypot(ball.vx, ball.vz) < 0.05) break;
  }
  return target === 'hole' ? done === 'hole' : done === 'key';
}

// Fans shots out from the direct line to the target. Returns the number of sims used, or -1 if none worked.
// A generator that yields every few shots, so the search can run in slices between frames.
export function* shotSearch(def, target = 'hole', maxSims = Infinity) {
  const [bx, bz] = def.ball;
  const [tx, tz] = target === 'hole' ? def.hole : def.keys[target];
  const direct = Math.atan2(tz - bz, tx - bx);
  const angles = [];
  for (let k = 0; k < 120; k++) angles.push(direct + Math.ceil(k / 2) * (Math.PI / 60) * (k % 2 ? 1 : -1));
  const powers = [0.3, 0.45, 0.6, 0.75, 0.9, 0.2, 1.0, 0.38, 0.52, 0.68, 0.82];
  let sims = 0;
  for (const a of angles) for (const p of powers) for (const t0 of [0, 0.7, 1.6, 2.5]) {
    if (++sims > maxSims) return -1;
    if (simulateShot(def, a, p, t0, target)) return sims;
    if (sims % 4 === 0) yield;
  }
  return -1;
}

export const runSync = it => { let r; do { r = it.next(); } while (!r.done); return r.value; };
export const findShot = (def, target = 'hole', maxSims = Infinity) => runSync(shotSearch(def, target, maxSims));

// Drives a generator in ~budgetMs slices, handing control back to the browser in between.
export function runSliced(it, budgetMs = 5) {
  return new Promise(resolve => {
    const tick = () => {
      const end = performance.now() + budgetMs;
      while (performance.now() < end) { const r = it.next(); if (r.done) { resolve(r.value); return; } }
      setTimeout(tick, 0);
    };
    tick();
  });
}
