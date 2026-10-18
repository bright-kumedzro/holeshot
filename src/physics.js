import { R, HOLE_R, WALL_E, BODY_E, BUMPER_KICK, MAX_SPEED, PICKUP_R, PORTAL_R } from './config.js';
import { roundRect, halfPlanes, closestOnPoly, zoneContains } from './geom.js';

// Runtime copy of a level: everything the simulation mutates lives here, never on the level definition.
export function createWorld(def, ghostMask = 0) {
  const inner = roundRect(def.w, def.h, def.rt, def.rb);
  const bodies = (def.bodies || []).map(src => ({
    ...src, flash: 0, cx: src.x, cz: src.z, vx: 0, vz: 0, th: src.angle,
    parts: src.parts.map(p => p.k === 'poly' ? { k: 'poly', pts: p.pts, w: new Float64Array(p.pts.length * 2) } : { ...p }),
  }));
  const zones = (def.zones || []).map(z => ({ ...z, dx: Math.cos(z.a || 0), dz: Math.sin(z.a || 0) }));
  const portals = (def.portals || []).map(p => ({ color: p.color, ends: [{ x: p.a[0], z: p.a[1] }, { x: p.b[0], z: p.b[1] }], lock: -1 }));
  const coins = (def.coins || []).map(([x, z], i) => ({ x, z, ghost: !!(ghostMask & (1 << i)), taken: false }));
  const keys = (def.keys || []).map(([x, z]) => ({ x, z, taken: false }));
  const W = {
    def, inner, walls: halfPlanes(inner), bodies, zones, portals, coins, keys,
    locked: !!def.lockHole && keys.length > 0,
    friction: def.friction ?? 1,
    hx: def.hole[0], hz: def.hole[1], move: def.holeMove || null,
  };
  for (const b of bodies) poseBody(b, 0);
  return W;
}

// Rotation convention: body-local (lx, lz) maps to world (cx + lx cos th - lz sin th, cz + lx sin th + lz cos th).
export function poseBody(b, t) {
  let cx = b.x, cz = b.z, vx = 0, vz = 0;
  if (b.move) {
    const m = b.move, ph = m.speed * t + (m.phase || 0), s = Math.sin(ph), c = Math.cos(ph), dz = m.dz || 0;
    cx += m.dx * m.amp * s; cz += dz * m.amp * s;
    vx = m.dx * m.amp * m.speed * c; vz = dz * m.amp * m.speed * c;
  }
  const th = b.angle + b.spin * t, co = Math.cos(th), si = Math.sin(th);
  b.cx = cx; b.cz = cz; b.vx = vx; b.vz = vz; b.th = th;
  for (const p of b.parts) {
    if (p.k === 'poly') {
      const L = p.pts, Wv = p.w;
      for (let i = 0; i < L.length; i++) { const lx = L[i][0], lz = L[i][1]; Wv[i * 2] = cx + lx * co - lz * si; Wv[i * 2 + 1] = cz + lx * si + lz * co; }
    } else { p.wx = cx + p.x * co - p.z * si; p.wz = cz + p.x * si + p.z * co; }
  }
}

export function updateHole(W, t) {
  if (!W.move) return;
  const m = W.move, s = Math.sin(m.speed * t + (m.phase || 0));
  W.hx = W.def.hole[0] + m.dx * m.amp * s;
  W.hz = W.def.hole[1] + (m.dz || 0) * m.amp * s;
}

// ---------- collision ----------
let ball = null, ev = null;

function resolve(nx, nz, pen, b, px, pz, e, kind) {
  ball.x += nx * pen; ball.z += nz * pen;
  let svx = 0, svz = 0;
  if (b) { svx = b.vx - b.spin * (pz - b.cz); svz = b.vz + b.spin * (px - b.cx); } // surface velocity at the contact
  const vn = (ball.vx - svx) * nx + (ball.vz - svz) * nz;
  if (vn < 0) {
    ball.vx -= (1 + e) * vn * nx; ball.vz -= (1 + e) * vn * nz;
    if (kind === 'bumper') { ball.vx += nx * BUMPER_KICK; ball.vz += nz * BUMPER_KICK; b.flash = 1; }
    ev.bounce(-vn, px, pz, kind);
  }
}

function collideCircle(cx, cz, cr, b) {
  const dx = ball.x - cx, dz = ball.z - cz, d = Math.hypot(dx, dz), min = cr + R;
  if (d < min && d > 1e-6) {
    const nx = dx / d, nz = dz / d;
    resolve(nx, nz, min - d, b, cx + nx * cr, cz + nz * cr, b.bumper ? 1.0 : BODY_E, b.bumper ? 'bumper' : 'body');
  }
}

function collidePoly(Wv, b) {
  const c = closestOnPoly(Wv, ball.x, ball.z);
  const qx = c.qx, qz = c.qz, d = c.d;
  if (c.inside) { const l = d || 1; resolve((qx - ball.x) / l, (qz - ball.z) / l, d + R, b, qx, qz, BODY_E, 'body'); }
  else if (d < R && d > 1e-6) resolve((ball.x - qx) / d, (ball.z - qz) / d, R - d, b, qx, qz, BODY_E, 'body');
}

// One substep. Returns false when the shot ends inside the step (captured or hazard).
export function step(W, b_, h, t, ev_) {
  ball = b_; ev = ev_;
  for (const b of W.bodies) poseBody(b, t);
  updateHole(W, t);

  let k = 0.55 * W.friction, c = 1.3 * W.friction, inBoost = false;
  for (const z of W.zones) {
    if (!zoneContains(z, ball.x, ball.z)) continue;
    switch (z.type) {
      case 'sand': k += 3.0; c += 2.4; break;
      case 'ice': k *= 0.3; c *= 0.3; break;
      case 'conveyor': ball.vx += z.dx * z.speed * h; ball.vz += z.dz * z.speed * h; break;
      case 'boost': {
        inBoost = true;
        if (ball.vx * z.dx + ball.vz * z.dz < 13) { ball.vx += z.dx * 32 * h; ball.vz += z.dz * 32 * h; }
        break;
      }
      case 'water': case 'lava': ev.hazard(z.type); return false;
    }
  }
  if (inBoost && !ball.inBoost) ev.boost();
  ball.inBoost = inBoost;

  let sp = Math.hypot(ball.vx, ball.vz);
  if (sp > 0) {
    let ns = Math.max(0, sp * Math.exp(-k * h) - c * h); // drag plus a constant brake so the ball settles
    if (ns > MAX_SPEED) ns = MAX_SPEED;
    ball.vx *= ns / sp; ball.vz *= ns / sp;
  }
  ball.x += ball.vx * h; ball.z += ball.vz * h;

  for (const b of W.bodies) for (const p of b.parts) p.k === 'poly' ? collidePoly(p.w, b) : collideCircle(p.wx, p.wz, p.r, b);
  for (const w of W.walls) {
    const d = (ball.x - w.ax) * w.nx + (ball.z - w.az) * w.nz;
    if (d < R) resolve(w.nx, w.nz, R - d, null, ball.x - w.nx * d, ball.z - w.nz * d, WALL_E, 'wall');
  }

  for (const p of W.portals) {
    if (p.lock >= 0) { // just arrived: wait until the ball clears the exit before it can re-enter
      const e = p.ends[p.lock];
      if (Math.hypot(ball.x - e.x, ball.z - e.z) > PORTAL_R + R) p.lock = -1;
      continue;
    }
    for (let i = 0; i < 2; i++) {
      const e = p.ends[i];
      if (Math.hypot(ball.x - e.x, ball.z - e.z) < PORTAL_R * 0.75) {
        const o = p.ends[1 - i];
        ball.x = o.x; ball.z = o.z; p.lock = 1 - i;
        ev.portal(e, o, p);
        break;
      }
    }
  }

  for (let i = 0; i < W.coins.length; i++) {
    const cn = W.coins[i];
    if (cn.taken || cn.ghost) continue;
    if (Math.hypot(ball.x - cn.x, ball.z - cn.z) < PICKUP_R) { cn.taken = true; ev.coin(i, cn); }
  }
  for (const ky of W.keys) {
    if (ky.taken) continue;
    if (Math.hypot(ball.x - ky.x, ball.z - ky.z) < PICKUP_R + 0.04) {
      ky.taken = true; ev.key(ky);
      if (W.locked && W.keys.every(k2 => k2.taken)) { W.locked = false; ev.unlock(); }
    }
  }

  if (!W.locked) {
    const dx = ball.x - W.hx, dz = ball.z - W.hz, hd = Math.hypot(dx, dz);
    if (hd < ball.minDist) ball.minDist = hd;
    if (hd < HOLE_R) {
      sp = Math.hypot(ball.vx, ball.vz);
      if (hd < HOLE_R - 0.06 && sp < 8.5) { ev.capture(); return false; }
      if (hd > 1e-4) { ball.vx -= dx / hd * 7 * h; ball.vz -= dz / hd * 7 * h; } // the lip tips it inward
    }
  }
  return true;
}

// ---------- aim preview: march a ray against static geometry, reflecting up to twice ----------
function probe(W, x, z) {
  for (const w of W.walls) { const d = (x - w.ax) * w.nx + (z - w.az) * w.nz; if (d < R) return [w.nx, w.nz]; }
  for (const b of W.bodies) {
    if (b.spin || b.move) continue;
    for (const p of b.parts) {
      if (p.k === 'poly') {
        const c = closestOnPoly(p.w, x, z);
        if (c.inside) { const l = c.d || 1; return [(c.qx - x) / l, (c.qz - z) / l]; }
        if (c.d < R) return [(x - c.qx) / c.d, (z - c.qz) / c.d];
      } else {
        const ddx = x - p.wx, ddz = z - p.wz, d = Math.hypot(ddx, ddz);
        if (d < p.r + R && d > 1e-6) return [ddx / d, ddz / d];
      }
    }
  }
  return null;
}

export function castPath(W, x, z, dx, dz, len) {
  const pts = [[x, z]], ds = 0.05;
  let travelled = 0, bounces = 0;
  while (travelled < len) {
    const nx = x + dx * ds, nz = z + dz * ds;
    travelled += ds;
    const n = probe(W, nx, nz);
    if (n) {
      if (bounces++ >= 2) break;
      pts.push([x, z]);
      const vn = dx * n[0] + dz * n[1];
      if (vn < 0) { dx -= 2 * vn * n[0]; dz -= 2 * vn * n[1]; }
      continue;
    }
    x = nx; z = nz;
    if (!W.locked && Math.hypot(x - W.hx, z - W.hz) < HOLE_R * 0.6) break;
    if (W.portals.some(p => p.ends.some(e => Math.hypot(x - e.x, z - e.z) < PORTAL_R * 0.75))) break;
  }
  pts.push([x, z]);
  return pts;
}
