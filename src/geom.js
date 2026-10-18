export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Rounded rectangle centred on the origin. x across, z along (far end is -z). rt/rb are the far/near corner radii.
export function roundRect(w, h, rt, rb) {
  rt = Math.min(rt, w / 2); rb = Math.min(rb, w / 2);
  const hw = w / 2, hh = h / 2, pts = [];
  const corner = (cx, cz, r, a0) => {
    if (r <= 0) { pts.push([cx, cz]); return; }
    const n = Math.max(4, Math.round(r * 10));
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  };
  corner(hw - rb, hh - rb, rb, 0);
  corner(-hw + rb, hh - rb, rb, Math.PI / 2);
  corner(-hw + rt, -hh + rt, rt, Math.PI);
  corner(hw - rt, -hh + rt, rt, Math.PI * 1.5);
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) out.push(p); }
  const f = out[0], l = out[out.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-4) out.pop();
  return out;
}

// Inward half-planes of a convex polygon that contains the origin.
export function halfPlanes(poly) {
  const walls = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const ex = c[0] - a[0], ez = c[1] - a[1], len = Math.hypot(ex, ez);
    if (len < 1e-6) continue;
    let nx = -ez / len, nz = ex / len;
    if (-a[0] * nx - a[1] * nz < 0) { nx = -nx; nz = -nz; }
    walls.push({ ax: a[0], az: a[1], nx, nz });
  }
  return walls;
}

const CP = { qx: 0, qz: 0, d: 0, inside: false };
// Closest point on a convex polygon's boundary (flat [x0,z0,x1,z1,...] array). Returns a shared scratch object.
export function closestOnPoly(W, x, z) {
  const n = W.length / 2;
  let inside = true, sign = 0, best = Infinity, qx = 0, qz = 0;
  for (let i = 0; i < n; i++) {
    const ax = W[i * 2], az = W[i * 2 + 1], j = ((i + 1) % n) * 2, ex = W[j] - ax, ez = W[j + 1] - az;
    const cr = ex * (z - az) - ez * (x - ax);
    if (cr !== 0) { const s = cr > 0 ? 1 : -1; if (!sign) sign = s; else if (s !== sign) inside = false; }
    let t = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t, pz = az + ez * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < best) { best = d2; qx = px; qz = pz; }
  }
  CP.qx = qx; CP.qz = qz; CP.d = Math.sqrt(best); CP.inside = inside;
  return CP;
}

export function zoneContains(zn, x, z, m = 0) {
  if (zn.shape === 'circle') return Math.hypot(x - zn.x, z - zn.z) <= zn.r + m;
  const dx = x - zn.x, dz = z - zn.z, c = Math.cos(zn.a || 0), s = Math.sin(zn.a || 0);
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  return Math.abs(lx) <= zn.w / 2 + m && Math.abs(lz) <= zn.d / 2 + m;
}

export function distToSeg(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
  let t = l2 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + ex * t), pz - (az + ez * t));
}
