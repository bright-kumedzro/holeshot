import { UP, box, poly, circ, B, bumper, slider, sand, water, lava, conveyor, boost, portal } from './build.js';
import { mulberry32 } from '../geom.js';

const PORTAL_COLORS = ['#36E0FF', '#FFB020', '#7CFF6B'];

// Builds a hole from a seed. Obstacles are dropped into evenly spaced bands between the ball and the hole,
// so every module keeps to its own strip of the course and nothing seals the path.
export function generate({ seed, pool, diff = 0.5, movingHole = 0 }) {
  const rnd = mulberry32(seed);
  const r = (a, b) => a + rnd() * (b - a);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const chance = p => rnd() < p;

  const w = +r(4.4, 5.0).toFixed(2), h = +r(9.0, 10.2).toFixed(2), hw = w / 2;
  const [rt, rb] = pick([[hw, 0.6], [hw, hw], [0.6, 0.6], [hw, 0.6], [1.2, 1.2], [0.6, hw]]);
  const moving = chance(movingHole);
  const hole = [moving ? 0 : r(-hw + 1, hw - 1), -h / 2 + (rt > 1.5 ? 1.3 : 1.0)];
  const holeMove = moving ? { dx: 1, dz: 0, amp: Math.min(1.1, hw - 1.1), speed: r(0.7, 1.1 + diff * 0.4), phase: r(0, 6.28) } : undefined;
  const ball = [rb > 1.5 ? r(-0.5, 0.5) : r(-hw + 1.1, hw - 1.1), h / 2 - (rb > 1.5 ? 1.3 : 1.0)];

  const count = diff < 0.25 ? 1 : diff < 0.6 ? (chance(0.6) ? 2 : 1) : (chance(0.55) ? 3 : 2);
  const top = hole[1] + 1.25, bot = ball[1] - 1.35, bh = (bot - top) / count;
  const bodies = [], zones = [], portals = [];
  const spin = () => (chance(0.5) ? -1 : 1) * r(0.9, 1.3 + diff * 0.9);
  // x of the straight ball-to-hole line at depth z; gaps are aimed near it so a clean line through always exists
  const lineX = z => ball[0] + (hole[0] - ball[0]) * (z - ball[1]) / (hole[1] - ball[1]);
  const gapCentre = (zc, g) => Math.max(-hw + g / 2 + 0.3, Math.min(hw - g / 2 - 0.3, lineX(zc) + r(-0.35, 0.35)));
  // pivots that would park a hub on the line get pushed to one side of it
  const offLine = (px, zc, clear, lim) => {
    const lx = lineX(zc);
    if (Math.abs(px - lx) >= clear) return px;
    const alt = [lx - clear, lx + clear].filter(v => Math.abs(v) <= lim);
    return alt.length ? alt[Math.floor(rnd() * alt.length)] : px;
  };

  function hazard(type, zc) {
    const g = r(1.3, 1.7), gc = gapCentre(zc, g), d = Math.max(0.6, Math.min(bh - 0.3, r(0.8, 1.3)));
    const l0 = -hw - 0.1, l1 = gc - g / 2, r0 = gc + g / 2, r1 = hw + 0.1, mk = type === 'lava' ? lava : water;
    if (l1 - l0 > 0.3) zones.push(mk((l0 + l1) / 2, zc, l1 - l0, d));
    if (r1 - r0 > 0.3) zones.push(mk((r0 + r1) / 2, zc, r1 - r0, d));
  }

  const M = {
    spinner(zc) {
      const px = offLine(r(-0.8, 0.8), zc, 0.55, 0.9), L = Math.max(0.55, Math.min(1.3, bh / 2 - 0.08, hw - Math.abs(px) - 0.5));
      bodies.push(B({ x: px, z: zc, spin: spin(), angle: r(0, 3), color: 'pink', parts: [box(0, 0, 2 * L, 0.28)] }),
                  B({ x: px, z: zc, h: 0.6, parts: [circ(0, 0, 0.2)] }));
    },
    cross(zc) {
      const px = offLine(r(-0.5, 0.5), zc, 0.8, 0.9), L = Math.max(0.6, Math.min(1.3, bh / 2 - 0.08, hw - Math.abs(px) - 0.5));
      bodies.push(B({ x: px, z: zc, spin: spin() * 0.8, angle: r(0, 3), color: 'pink', parts: [box(0, 0, 2 * L, 0.26), box(0, 0, 0.26, 2 * L)] }),
                  B({ x: px, z: zc, h: 0.6, parts: [circ(0, 0, Math.min(0.4, L * 0.4))] }));
    },
    twin(zc) {
      const L = Math.max(0.5, Math.min(hw / 2 - 0.25, bh / 2 - 0.08, 1.0)), s = spin();
      for (const sx of [-1, 1]) {
        const px = sx * hw / 2;
        bodies.push(B({ x: px, z: zc, spin: s * sx, angle: sx > 0 ? 1.57 : 0, color: 'pink', parts: [box(0, 0, 2 * L, 0.26)] }),
                    B({ x: px, z: zc, h: 0.6, parts: [circ(0, 0, 0.18)] }));
      }
    },
    sweeper(zc) {
      const bw = r(0.9, 1.4);
      bodies.push(slider(0, zc, bw, hw - bw / 2 - 0.35, r(1.2, 1.7 + diff * 1.2), { phase: r(0, 6.28) }));
    },
    gate(zc) {
      const g = r(1.15, 1.5) - diff * 0.15, gc = gapCentre(zc, g);
      const l0 = -hw - 0.12, l1 = gc - g / 2, r0 = gc + g / 2, r1 = hw + 0.12;
      bodies.push(B({ parts: [box((l0 + l1) / 2, zc, l1 - l0, 0.32), box((r0 + r1) / 2, zc, r1 - r0, 0.32)] }));
    },
    pegs(zc) {
      const sp = r(0.72, 0.88), rows = bh > 1.6 ? 2 : 1, parts = [];
      for (let row = 0; row < rows; row++) {
        const z = zc + (rows === 2 ? (row ? 0.32 : -0.32) : 0), off = row % 2 ? sp / 2 : 0;
        for (let x = -hw + 0.4 + off; x <= hw - 0.4; x += sp) parts.push(circ(x, z, 0.1));
      }
      bodies.push(B({ color: 'pink', h: 0.45, parts }));
    },
    tris(zc) {
      const d1 = r(1.0, 1.5), d2 = r(1.0, 1.5), s = Math.max(0.25, Math.min(0.5, bh / 2 - 0.3));
      bodies.push(B({ color: 'pink', parts: [
        poly([[-hw - 0.12, zc + 0.25 - s], [-hw - 0.12, zc + 0.25 + s], [-hw + d1, zc + 0.25]]),
        poly([[hw + 0.12, zc - 0.25 - s], [hw + 0.12, zc - 0.25 + s], [hw - d2, zc - 0.25]]),
      ] }));
    },
    bumpers(zc) {
      const xs = bh > 1.5 ? [-hw * 0.55, 0, hw * 0.55] : [-hw * 0.4, hw * 0.4];
      const jz = Math.max(0, Math.min(0.35, bh / 2 - 0.4));
      for (const x of xs) bodies.push(bumper(x + r(-0.25, 0.25), zc + r(-1, 1) * jz, 0.28));
    },
    sand(zc) { zones.push(sand(r(-0.5, 0.5), zc, r(2.2, w - 0.6), Math.max(0.7, Math.min(bh - 0.2, r(0.9, 1.6))))); },
    water(zc) { hazard('water', zc); },
    lava(zc) { hazard('lava', zc); },
    conveyor(zc) {
      zones.push(conveyor(0, zc, w + 0.3, Math.max(0.6, Math.min(bh - 0.2, r(0.8, 1.2))), chance(0.5) ? 0 : Math.PI, r(5, 7 + diff * 2)));
    },
    boost(zc) {
      zones.push(boost(r(-hw + 0.9, hw - 0.9), zc + 0.3, 1.0, 0.9, UP + r(-0.35, 0.35)));
      M.gate(zc - Math.min(0.5, bh / 2 - 0.2));
    },
    portal(zc) {
      if (bh < 1.7 || portals.length) return M.sweeper(zc);
      bodies.push(B({ parts: [box(0, zc, w + 0.3, 0.34)] })); // a full wall: the portal is the only way through
      portals.push(portal(r(-hw + 0.7, hw - 0.7), zc + 0.75, r(-hw + 0.7, hw - 0.7), zc - 0.75, PORTAL_COLORS[0]));
    },
  };

  let last = '';
  for (let i = 0; i < count; i++) {
    let m, guard = 0;
    do { m = pick(pool); } while ((m === last || (count === 3 && m === 'cross')) && guard++ < 20);
    last = m;
    M[m](top + bh * (i + 0.5));
  }
  if (!moving && diff > 0.5 && chance(0.35)) {
    bodies.push(slider(0, hole[1] + 0.85, 0.8, Math.min(1.1, hw - 0.8), r(1.6, 2.3), { phase: r(0, 6.28), d: 0.3 }));
  }
  return { w, h, rt, rb, hole, holeMove, ball, bodies, zones, portals };
}
