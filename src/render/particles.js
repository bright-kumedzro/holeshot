import * as THREE from 'three';

const MAX = 900;
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

const VERT = `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * smoothstep(0.5, 0.3, d));
}`;

// One pooled point cloud for every effect: confetti, dust, sparks, splashes and trail particles.
export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.alpha0 = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  setScale(px) { this.mat.uniforms.uScale.value = px; }

  emit(x, y, z, vx, vy, vz, life, size, color, { alpha = 1, grav = 0, drag = 0, grow = 0 } = {}) {
    const i = this.next; this.next = (i + 1) % MAX;
    const c = typeof color === 'string' ? rgb(color) : color;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.col.set([c[0], c[1], c[2], alpha], i * 4);
    this.life[i] = this.maxLife[i] = life; this.size[i] = this.size0[i] = size;
    this.alpha0[i] = alpha; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }

  burst(type, x, y, z, color) {
    const R = Math.random;
    switch (type) {
      case 'confetti': {
        const cols = ['#FF2E88', '#FFD21F', '#FFFFFF', '#36E0FF', '#7CFF6B'];
        for (let i = 0; i < 70; i++) {
          const a = R() * Math.PI * 2, s = 0.5 + R() * 2.2;
          this.emit(x, y, z, Math.cos(a) * s, 3.5 + R() * 3.5, Math.sin(a) * s, 1.2 + R() * 0.7, 0.1 + R() * 0.06, cols[i % cols.length], { grav: 9, drag: 0.5 });
        }
        break;
      }
      case 'dust':
        for (let i = 0; i < 6; i++) this.emit(x, y, z, (R() - 0.5) * 1.2, 0.3 + R() * 0.5, (R() - 0.5) * 1.2, 0.4, 0.08, '#FFFFFF', { alpha: 0.6, grow: 1.5, drag: 2 });
        break;
      case 'spark':
        for (let i = 0; i < 12; i++) { const a = R() * Math.PI * 2; this.emit(x, y, z, Math.cos(a) * 2.4, 0.6 + R(), Math.sin(a) * 2.4, 0.3, 0.07, color || '#FF2E88', { drag: 3 }); }
        break;
      case 'coin':
        for (let i = 0; i < 14; i++) this.emit(x, y, z, (R() - 0.5) * 2, 1 + R() * 1.6, (R() - 0.5) * 2, 0.6, 0.07, R() < 0.5 ? '#FFD21F' : '#FFF3B0', { grav: 3, drag: 1 });
        break;
      case 'portal':
        for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; this.emit(x, y, z, Math.cos(a) * 1.6, 0.4 + R() * 0.6, Math.sin(a) * 1.6, 0.5, 0.07, color || '#36E0FF', { drag: 2 }); }
        break;
      case 'splash':
        for (let i = 0; i < 30; i++) this.emit(x, y, z, (R() - 0.5) * 3, 2 + R() * 2.6, (R() - 0.5) * 3, 0.8, 0.09, i % 3 ? color : '#FFFFFF', { grav: 9 });
        break;
      case 'boost':
        for (let i = 0; i < 10; i++) this.emit(x + (R() - 0.5) * 0.3, y, z + (R() - 0.5) * 0.3, 0, 1.5 + R() * 1.5, 0, 0.35, 0.07, '#FFF3B0', { drag: 2 });
        break;
      case 'unlock':
        for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; this.emit(x, y, z, Math.cos(a) * 2.6, 1 + R(), Math.sin(a) * 2.6, 0.6, 0.09, i % 2 ? '#FFD21F' : '#FFFFFF', { drag: 2.5 }); }
        break;
    }
  }

  update(dt) {
    const { pos, vel, life, col } = this;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { this.size[i] = 0; col[i * 4 + 3] = 0; continue; }
      const j = i * 3, damp = Math.max(0, 1 - this.drag[i] * dt);
      vel[j + 1] -= this.grav[i] * dt;
      vel[j] *= damp; vel[j + 1] *= damp; vel[j + 2] *= damp;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      if (this.grav[i] > 0 && pos[j + 1] < 0.02) { pos[j + 1] = 0.02; vel[j + 1] *= -0.4; vel[j] *= 0.7; vel[j + 2] *= 0.7; }
      const k = life[i] / this.maxLife[i];
      this.size[i] = Math.max(0, this.size0[i] * (1 + this.grow[i] * (1 - k)));
      col[i * 4 + 3] = this.alpha0[i] * Math.min(1, k * 2.5);
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}
