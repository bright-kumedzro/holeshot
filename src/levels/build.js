// Level building blocks. Coordinates: x across the course, z along it.
// The ball starts near +z (camera side) and the hole sits toward -z.
// Angles: a local +x axis rotated by `a` points along (cos a, sin a) in (x, z).

export const UP = -Math.PI / 2; // pointing toward the hole end

export const box = (x, z, w, d, a = 0) => {
  const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hd = d / 2;
  return { k: 'poly', pts: [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c - lz * s, z + lx * s + lz * c]) };
};
export const seg = (x1, z1, x2, z2, t = 0.3) =>
  box((x1 + x2) / 2, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1), t, Math.atan2(z2 - z1, x2 - x1));
export const poly = pts => ({ k: 'poly', pts });
export const circ = (x, z, r) => ({ k: 'circ', x, z, r });

// A body is a rigid group of parts with an optional spin (rad/s) and sine-wave movement.
export const B = o => ({ x: 0, z: 0, angle: 0, spin: 0, move: null, color: 'white', parts: [], ...o, h: o.h ?? (o.color === 'pink' ? 0.38 : 0.42) });
export const pegGrid = (xs, zs, r) => zs.flatMap(z => xs.map(x => circ(x, z, r)));
export const bumper = (x, z, r = 0.28) => B({ color: 'bumper', bumper: true, h: 0.3, parts: [circ(x, z, r)] });

export const spinner = (x, z, len, spin, { angle = 0, hub = 0.22, thick = 0.3 } = {}) => [
  B({ x, z, spin, angle, color: 'pink', parts: [box(0, 0, len, thick)] }),
  B({ x, z, h: 0.62, parts: [circ(0, 0, hub)] }),
];
export const crossSpinner = (x, z, len, spin, { angle = 0, hub = 0.4, thick = 0.28 } = {}) => [
  B({ x, z, spin, angle, color: 'pink', parts: [box(0, 0, len, thick), box(0, 0, thick, len)] }),
  B({ x, z, h: 0.62, parts: [circ(0, 0, hub)] }),
];
export const slider = (x, z, w, amp, speed, { phase = 0, d = 0.34, dx = 1, dz = 0 } = {}) =>
  B({ x, z, color: 'pink', move: { dx, dz, amp, speed, phase }, parts: [box(0, 0, w, d)] });

const rect = type => (x, z, w, d, a = 0) => ({ type, shape: 'rect', x, z, w, d, a });
export const sand = rect('sand');
export const water = rect('water');
export const lava = rect('lava');
export const ice = rect('ice');
export const sandC = (x, z, r) => ({ type: 'sand', shape: 'circle', x, z, r, a: 0 });
// Belts and boost pads push along their own +x axis (angle a).
export const conveyor = (x, z, len, wid, a, speed = 7) => ({ type: 'conveyor', shape: 'rect', x, z, w: len, d: wid, a, speed });
export const boost = (x, z, len, wid, a) => ({ type: 'boost', shape: 'rect', x, z, w: len, d: wid, a });
export const portal = (ax, az, bx, bz, color = '#36E0FF') => ({ a: [ax, az], b: [bx, bz], color });
