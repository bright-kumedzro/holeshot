import * as THREE from 'three';

const N = 34, LIFE = 0.42;
const RIBBON = new Set(['ribbon', 'rainbow', 'fire']);
const cTail = new THREE.Color('#FF2A00'), cHead = new THREE.Color('#FFD21F'), cTmp = new THREE.Color();

// A flat ribbon on the floor behind the ball, plus particle emitters for the fancier trails.
export class Trail {
  constructor(scene, particles) {
    this.p = particles;
    this.type = 'none';
    this.pts = [];
    this.acc = 0;
    this.time = 0;
    this.positions = new Float32Array(N * 2 * 3);
    this.colors = new Float32Array(N * 2 * 4);
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('color', this.aCol);
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  setType(t) { this.type = t; this.reset(); }
  reset() { this.pts.length = 0; this.mesh.visible = false; }

  update(dt, x, z, moving, speed) {
    this.time += dt;
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[0].age > LIFE) this.pts.shift();
    if (moving && this.type !== 'none') {
      const l = this.pts[this.pts.length - 1];
      if (!l || Math.hypot(l.x - x, l.z - z) > 0.04) { this.pts.push({ x, z, age: 0 }); if (this.pts.length > N) this.pts.shift(); }
    }
    this.mesh.visible = RIBBON.has(this.type) && this.pts.length > 1;
    if (this.mesh.visible) this.rebuild();
    if (moving && speed > 0.6) this.emit(dt, x, z, speed);
  }

  rebuild() {
    const pts = this.pts, n = pts.length, P = this.positions, C = this.colors;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l;
      const f = i / (n - 1), fade = 1 - p.age / LIFE, hw = 0.14 * f * (0.5 + 0.5 * fade);
      P.set([p.x + px * hw, 0.03, p.z + pz * hw, p.x - px * hw, 0.03, p.z - pz * hw], i * 6);
      if (this.type === 'rainbow') cTmp.setHSL((f * 0.8 + this.time * 0.5) % 1, 0.95, 0.6);
      else if (this.type === 'fire') cTmp.copy(cTail).lerp(cHead, f);
      else cTmp.setRGB(1, 1, 1);
      const al = f * 0.85 * fade;
      C.set([cTmp.r, cTmp.g, cTmp.b, al, cTmp.r, cTmp.g, cTmp.b, al], i * 8);
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
  }

  emit(dt, x, z, speed) {
    const rate = { sparkle: 45, bubbles: 18, fire: 55 }[this.type];
    if (!rate) return;
    this.acc += dt * rate * Math.min(1, speed / 4);
    const R = Math.random;
    while (this.acc >= 1) {
      this.acc -= 1;
      const jx = x + (R() - 0.5) * 0.25, jz = z + (R() - 0.5) * 0.25;
      if (this.type === 'sparkle') this.p.emit(jx, 0.12 + R() * 0.15, jz, (R() - 0.5) * 0.4, 0.4 + R() * 0.4, (R() - 0.5) * 0.4, 0.5, 0.05 + R() * 0.03, R() < 0.5 ? '#FFFFFF' : '#FFE27A');
      else if (this.type === 'bubbles') this.p.emit(jx, 0.15, jz, (R() - 0.5) * 0.3, 0.5 + R() * 0.4, (R() - 0.5) * 0.3, 0.9, 0.09 + R() * 0.07, '#BFE9FF', { alpha: 0.55, grow: 0.5, drag: 0.6 });
      else this.p.emit(jx, 0.1, jz, (R() - 0.5) * 0.3, 0.8 + R() * 0.6, (R() - 0.5) * 0.3, 0.35, 0.09, R() < 0.4 ? '#FFB020' : R() < 0.7 ? '#FF6A00' : '#FF2A00', { grow: -0.8 });
    }
  }
}
