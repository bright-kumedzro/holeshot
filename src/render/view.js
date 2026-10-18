import * as THREE from 'three';
import { R, HOLE_R, RIM_T, RIM_H, PORTAL_R } from '../config.js';
import { roundRect } from '../geom.js';
import { ballMaterial, floorTexture, zoneTexture, ZONE_PERIOD, swirlTexture, lidTexture } from './textures.js';
import { Particles } from './particles.js';
import { Trail } from './trail.js';

// Shapes are drawn in XY and laid flat with rotateX(-90deg), which maps shape y to world -z.
const flat = g => { g.rotateX(-Math.PI / 2); return g; };
const toShape = pts => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
const toPath = pts => new THREE.Path(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
function roundedRectShape(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const ZONE_Y = { sand: 0.004, ice: 0.004, water: 0.005, lava: 0.005, conveyor: 0.006, boost: 0.008 };

const axis = new THREE.Vector3(), quat = new THREE.Quaternion(), tmpV = new THREE.Vector3();
const cWhite = new THREE.Color(0xffffff), cPink = new THREE.Color(0xff2e88), cTmp = new THREE.Color();

export class View {
  constructor(el) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);
    this.canvas = r.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334466, 1.8);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 1.95);
    sun.position.set(3.5, 12, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    this.mats = {
      pink: new THREE.MeshStandardMaterial({ color: '#FF2E88', roughness: 0.45 }),
      white: new THREE.MeshStandardMaterial({ color: '#F7F7FB', roughness: 0.6 }),
      gold: new THREE.MeshStandardMaterial({ color: '#FFC21A', roughness: 0.3, metalness: 0.35, emissive: '#4A2C00' }),
      ghost: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.5, transparent: true, opacity: 0.28, depthWrite: false }),
    };
    this.geos = {
      coin: new THREE.CylinderGeometry(0.15, 0.15, 0.045, 28).rotateX(Math.PI / 2),
    };

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), ballMaterial('classic'));
    this.ball.castShadow = true;
    this.ball.visible = false;
    this.scene.add(this.ball);
    this.squashT = 0;

    // aim guide
    this.dots = [];
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(flat(new THREE.CircleGeometry(0.05, 12)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 3; this.scene.add(m); this.dots.push(m);
    }
    const arrowShape = new THREE.Shape([new THREE.Vector2(0, 0.2), new THREE.Vector2(-0.16, -0.06), new THREE.Vector2(0.16, -0.06)]);
    this.arrow = new THREE.Mesh(flat(new THREE.ShapeGeometry(arrowShape)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    this.arrow.visible = false; this.scene.add(this.arrow);
    this.ring = new THREE.Mesh(flat(new THREE.RingGeometry(R + 0.06, R + 0.12, 40)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false; this.scene.add(this.ring);

    this.particles = new Particles(this.scene);
    this.trail = new Trail(this.scene, this.particles);
    this.course = null;
    this.camBase = new THREE.Vector3();
    this.shake = 0;
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
  }

  setSkin(id) {
    const old = this.ball.material;
    this.ball.material = ballMaterial(id);
    if (old.map) old.map.dispose();
    old.dispose();
  }
  setTrail(id) { this.trail.setType(id); }

  // Call fit() afterwards: the drawing buffer size changes with the pixel ratio.
  setQuality(q) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    const s = this.sun.shadow;
    if (s.mapSize.x !== q.shadow) {
      s.mapSize.set(q.shadow, q.shadow);
      if (s.map) { s.map.dispose(); s.map = null; } // three.js rebuilds it at the new size
    }
  }

  // ---------- course ----------
  build(W) {
    if (this.course) {
      this.scene.remove(this.course);
      this.course.traverse(o => {
        if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
        if (!o.material) return;
        for (const m of [].concat(o.material)) {
          if (!m.userData.ownMat || m.userData.disposed) continue;
          if (m.userData.ownMap && m.map) m.map.dispose();
          m.dispose(); m.userData.disposed = true;
        }
      });
    }
    const def = W.def, pal = def.palette;
    const g = this.course = new THREE.Group();
    this.scene.add(g);
    this.hemi.groundColor.set(pal.bg);
    // Marks per-course materials (a mesh's, or a bare material) so they are disposed with the course; shared ones are left alone.
    const own = (x, map = false) => { for (const m of x.isMesh ? [].concat(x.material) : [x]) { m.userData.ownMat = true; m.userData.ownMap = map; } return x; };

    // floor slab; a static hole is cut through it, a moving hole is a decal the floor hides the ball under
    const floorShape = toShape(W.inner);
    if (!W.move) { const hp = new THREE.Path(); hp.absarc(def.hole[0], -def.hole[1], HOLE_R, 0, Math.PI * 2, true); floorShape.holes.push(hp); }
    const fg = new THREE.ExtrudeGeometry(floorShape, { depth: 0.6, bevelEnabled: false, curveSegments: 36 });
    fg.rotateX(-Math.PI / 2); fg.translate(0, -0.6, 0);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(def.floorStyle, pal.floor), roughness: def.floorStyle === 'ice' ? 0.35 : 0.95 });
    const floor = own(new THREE.Mesh(fg, floorMat));
    floor.receiveShadow = true; g.add(floor);

    // rim
    const outer = roundRect(def.w + 2 * RIM_T, def.h + 2 * RIM_T, def.rt > 0 ? def.rt + RIM_T : 0, def.rb > 0 ? def.rb + RIM_T : 0);
    const rimShape = toShape(outer); rimShape.holes.push(toPath(W.inner));
    const rg = new THREE.ExtrudeGeometry(rimShape, { depth: RIM_H + 0.5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3 });
    rg.rotateX(-Math.PI / 2); rg.translate(0, -0.55, 0);
    const rim = new THREE.Mesh(rg, this.mats.white); rim.castShadow = true; rim.receiveShadow = true; g.add(rim);

    // hole
    const hole = this.holeGroup = new THREE.Group(); g.add(hole);
    if (!W.move) {
      const throat = own(new THREE.Mesh(new THREE.CylinderGeometry(HOLE_R - 0.003, HOLE_R - 0.003, 0.58, 36, 1, true), new THREE.MeshBasicMaterial({ color: '#0F0F1A', side: THREE.BackSide })));
      throat.position.y = -0.3; hole.add(throat);
      const bottom = own(new THREE.Mesh(flat(new THREE.CircleGeometry(HOLE_R, 36)), new THREE.MeshBasicMaterial({ color: '#07070D' })));
      bottom.position.y = -0.58; hole.add(bottom);
    } else {
      const decal = own(new THREE.Mesh(flat(new THREE.CircleGeometry(HOLE_R, 36)), new THREE.MeshBasicMaterial({ color: '#07070D', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
      decal.position.y = 0.004; hole.add(decal);
    }
    this.lipBase = new THREE.Color(pal.lip);
    this.lipMat = own(new THREE.MeshBasicMaterial({ color: pal.lip, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const lip = new THREE.Mesh(flat(new THREE.RingGeometry(HOLE_R, HOLE_R + 0.05, 40)), this.lipMat);
    lip.position.y = 0.006; hole.add(lip);
    this.lid = null; this.lidAnim = 0;
    if (W.locked) {
      const side = new THREE.MeshStandardMaterial({ color: '#C81E68', roughness: 0.5 });
      const top = new THREE.MeshStandardMaterial({ map: lidTexture(), roughness: 0.5 });
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(HOLE_R + 0.06, HOLE_R + 0.06, 0.05, 36), [own(side), own(top), side]);
      lid.position.y = 0.025; lid.castShadow = true;
      hole.add(lid); this.lid = lid;
    }
    hole.position.set(W.hx, 0, W.hz);

    // zones
    this.zoneAnims = [];
    for (const z of W.zones) {
      const shape = z.shape === 'circle'
        ? (() => { const s = new THREE.Shape(); s.absarc(0, 0, z.r, 0, Math.PI * 2, false); return s; })()
        : roundedRectShape(z.w, z.d, Math.min(0.22, z.w / 2, z.d / 2));
      const geo = flat(new THREE.ShapeGeometry(shape, 24));
      const tex = zoneTexture(z.type).clone(); tex.needsUpdate = true;
      const period = ZONE_PERIOD[z.type];
      tex.repeat.set(1 / period, 1 / period);
      const mat = own(new THREE.MeshStandardMaterial({ map: tex, roughness: z.type === 'ice' ? 0.2 : z.type === 'water' ? 0.25 : 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), true);
      if (z.type === 'lava' || z.type === 'boost') { mat.emissive = new THREE.Color('#ffffff'); mat.emissiveMap = tex; mat.emissiveIntensity = z.type === 'lava' ? 0.85 : 0.45; }
      const m = new THREE.Mesh(geo, mat);
      m.position.set(z.x, ZONE_Y[z.type], z.z);
      m.rotation.y = -(z.a || 0);
      m.receiveShadow = true; g.add(m);
      const rate = z.type === 'conveyor' ? [-(1.3 / period), 0] : z.type === 'boost' ? [-(2.6 / period), 0] : z.type === 'water' ? [0.05, 0.08] : z.type === 'lava' ? [0.03, 0.05] : null;
      if (rate) this.zoneAnims.push({ tex, rate });
    }

    // obstacles
    for (const b of W.bodies) {
      const bg = new THREE.Group();
      if (b.bumper) {
        const p = b.parts[0];
        const pulse = new THREE.Group(); pulse.position.set(p.x, 0, p.z); bg.add(pulse);
        const mat = own(new THREE.MeshStandardMaterial({ color: '#FF2E88', roughness: 0.35, emissive: '#FF2E88', emissiveIntensity: 0 }));
        const base = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.05, b.h, 28).translate(0, b.h / 2, 0), mat);
        base.castShadow = true; base.receiveShadow = true; pulse.add(base);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r * 0.78, 0.05, 10, 32).rotateX(Math.PI / 2).translate(0, b.h, 0), this.mats.white);
        ring.castShadow = true; pulse.add(ring);
        b.pulse = pulse; b.flashMat = mat;
      } else {
        const mat = this.mats[b.color] || this.mats.white;
        for (const p of b.parts) {
          let geo;
          if (p.k === 'poly') {
            geo = new THREE.ExtrudeGeometry(toShape(p.pts), { depth: b.h - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
            geo.rotateX(-Math.PI / 2); geo.translate(0, 0.04, 0);
          } else {
            geo = new THREE.CylinderGeometry(p.r, p.r, b.h, 28).translate(p.x, b.h / 2, p.z);
          }
          const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; bg.add(m);
        }
      }
      g.add(bg); b.mesh = bg;
    }

    // portals
    const swirl = swirlTexture();
    for (const p of W.portals) {
      for (const e of p.ends) {
        const pg = new THREE.Group(); pg.position.set(e.x, 0, e.z);
        const glow = own(new THREE.Mesh(flat(new THREE.CircleGeometry(PORTAL_R * 1.5, 32)), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.25, depthWrite: false })));
        glow.position.y = 0.008; pg.add(glow);
        const disc = own(new THREE.Mesh(flat(new THREE.CircleGeometry(PORTAL_R, 32)), new THREE.MeshBasicMaterial({ map: swirl, color: p.color, transparent: true, depthWrite: false })));
        disc.position.y = 0.012; pg.add(disc);
        const ring = own(new THREE.Mesh(new THREE.TorusGeometry(PORTAL_R, 0.045, 10, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: p.color })));
        ring.position.y = 0.04; pg.add(ring);
        g.add(pg); e.disc = disc;
      }
    }

    // coins
    for (const c of W.coins) {
      const m = new THREE.Mesh(this.geos.coin, c.ghost ? this.mats.ghost : this.mats.gold);
      m.userData.sharedGeo = true;
      m.position.set(c.x, 0.3, c.z); m.castShadow = !c.ghost;
      g.add(m); c.mesh = m; c.anim = 0;
    }

    // keys
    for (const k of W.keys) {
      const kg = new THREE.Group();
      const head = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.03, 10, 24), this.mats.gold);
      head.position.x = -0.1;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.045), this.mats.gold);
      shaft.position.x = 0.06;
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.045), this.mats.gold); t1.position.set(0.13, -0.05, 0);
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.045), this.mats.gold); t2.position.set(0.075, -0.04, 0);
      const inner = new THREE.Group(); inner.add(head, shaft, t1, t2);
      inner.traverse(o => { if (o.isMesh) o.castShadow = true; });
      kg.add(inner);
      const pad = own(new THREE.Mesh(flat(new THREE.RingGeometry(0.2, 0.26, 32)), new THREE.MeshBasicMaterial({ color: '#FFD21F', transparent: true, opacity: 0.8, depthWrite: false })));
      pad.position.y = 0.007; kg.add(pad);
      kg.position.set(k.x, 0, k.z);
      g.add(kg); k.mesh = kg; k.inner = inner; k.anim = 0;
    }
  }

  // ---------- camera: fit the whole course between the HUD and the bottom hint ----------
  fit(W, topPx = 80, botPx = 70) {
    const Wd = window.innerWidth, Hd = window.innerHeight, cam = this.camera;
    this.renderer.setSize(Wd, Hd, false);
    cam.aspect = Wd / Hd; cam.clearViewOffset(); cam.updateProjectionMatrix();
    const buf = new THREE.Vector2(); this.renderer.getDrawingBufferSize(buf);
    this.particles.setScale(buf.y / (2 * Math.tan((cam.fov * Math.PI) / 360)));
    if (!W) return;
    const d = W.def, hw = d.w / 2 + RIM_T + 0.05, hh = d.h / 2 + RIM_T + 0.05;
    const pts = [];
    for (const x of [-hw, hw]) for (const z of [-hh, hh]) for (const y of [-0.6, RIM_H]) pts.push(new THREE.Vector3(x, y, z));
    const yMax = 1 - (2 * topPx) / Hd, yMin = -1 + (2 * botPx) / Hd, xMax = 1 - (2 * 14) / Wd;
    const tilt = ((Wd / Hd < 0.8 ? 60 : 55) * Math.PI) / 180;
    const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const measure = dist => {
      cam.position.copy(dir).multiplyScalar(dist); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      let mx = 0, lo = Infinity, hi = -Infinity;
      for (const p of pts) {
        tmpV.copy(p).applyMatrix4(cam.matrixWorldInverse);
        if (tmpV.z > -0.5) return null;
        tmpV.copy(p).project(cam);
        mx = Math.max(mx, Math.abs(tmpV.x)); lo = Math.min(lo, tmpV.y); hi = Math.max(hi, tmpV.y);
      }
      return { mx, lo, hi };
    };
    let a = 6, b = 90;
    for (let i = 0; i < 30; i++) {
      const mid = (a + b) / 2, m = measure(mid);
      if (m && m.mx <= xMax && m.hi - m.lo <= yMax - yMin) b = mid; else a = mid;
    }
    const m = measure(b);
    this.camBase.copy(cam.position);
    cam.setViewOffset(Wd, Hd, 0, (((yMin + yMax) / 2 - (m.lo + m.hi) / 2) * Hd) / 2, Wd, Hd);
    cam.updateProjectionMatrix();
  }

  rayFloor(clientX, clientY) {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, out) ? out : null;
  }

  project(x, y, z) {
    tmpV.set(x, y, z).project(this.camera);
    return { x: ((tmpV.x + 1) / 2) * window.innerWidth, y: ((1 - tmpV.y) / 2) * window.innerHeight };
  }

  // ---------- ball + aim ----------
  placeBall(x, z, roll = false) {
    if (roll) {
      const mx = x - this.ball.position.x, mz = z - this.ball.position.z, d = Math.hypot(mx, mz);
      if (d > 1e-6 && d < 1) { axis.set(mz / d, 0, -mx / d); quat.setFromAxisAngle(axis, d / R); this.ball.quaternion.premultiply(quat); }
    }
    this.ball.position.set(x, R, z);
  }
  squash() { this.squashT = 0.22; }
  shakeIt(amount) { this.shake = Math.max(this.shake, amount); }

  showAim(pts, power) {
    let total = 0;
    const segs = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
    const n = this.dots.length;
    let lastDir = [0, -1], endX = pts[0][0], endZ = pts[0][1];
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / n, target = t * total;
      let acc = 0, s = 0;
      while (s < segs.length - 1 && acc + segs[s] < target) { acc += segs[s]; s++; }
      const a = pts[s], b = pts[s + 1] || a, f = segs[s] ? (target - acc) / segs[s] : 0;
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      const m = this.dots[k];
      m.position.set(x, 0.02, z); m.scale.setScalar(1 - t * 0.35); m.material.opacity = 0.95 - t * 0.55; m.visible = total > 0.05;
      if (segs[s]) { lastDir = [(b[0] - a[0]) / segs[s], (b[1] - a[1]) / segs[s]]; }
      endX = x; endZ = z;
    }
    this.arrow.position.set(endX + lastDir[0] * 0.16, 0.021, endZ + lastDir[1] * 0.16);
    this.arrow.rotation.set(0, Math.atan2(-lastDir[0], -lastDir[1]), 0);
    this.arrow.visible = true;
    cTmp.copy(cWhite).lerp(cPink, power);
    this.arrow.material.color.copy(cTmp); this.ring.material.color.copy(cTmp);
    this.ring.position.set(this.ball.position.x, 0.02, this.ball.position.z);
    this.ring.scale.setScalar(1 + power * 0.5); this.ring.visible = true;
  }
  hideAim() { for (const m of this.dots) m.visible = false; this.arrow.visible = false; this.ring.visible = false; }

  // ---------- per-frame ----------
  update(rdt, dt, t, W, ballState, rolling) {
    if (W && this.course) {
      for (const b of W.bodies) {
        b.mesh.position.set(b.cx, 0, b.cz);
        b.mesh.rotation.y = -b.th;
        if (b.bumper) {
          b.flash = Math.max(0, b.flash - rdt * 5);
          const s = 1 + 0.28 * b.flash;
          b.pulse.scale.set(s, 1 + 0.1 * b.flash, s);
          b.flashMat.emissiveIntensity = b.flash * 0.9;
        }
      }
      this.holeGroup.position.set(W.hx, 0, W.hz);
      if (this.lid && !W.locked && this.lid.visible) {
        this.lidAnim = Math.min(1, this.lidAnim + rdt * 2.5);
        this.lid.position.y = 0.025 + this.lidAnim * 0.7;
        this.lid.rotation.y += rdt * 10;
        this.lid.scale.setScalar(Math.max(0.01, 1 - this.lidAnim));
        if (this.lidAnim >= 1) this.lid.visible = false;
      }
      for (const c of W.coins) {
        const m = c.mesh;
        if (!c.taken) { m.rotation.y = t * 3 + c.x; m.position.y = 0.3 + Math.sin(t * 3 + c.z) * 0.04; }
        else if (m.visible) {
          c.anim += rdt * 3;
          m.position.y = 0.3 + c.anim; m.rotation.y += rdt * 20; m.scale.setScalar(Math.max(0.01, 1 - c.anim));
          if (c.anim >= 1) m.visible = false;
        }
      }
      for (const k of W.keys) {
        if (!k.taken) { k.inner.rotation.y = t * 2; k.inner.position.y = 0.35 + Math.sin(t * 2.5) * 0.06; }
        else if (k.mesh.visible) {
          k.anim += rdt * 2.2;
          k.inner.position.y = 0.35 + k.anim * 1.4; k.inner.rotation.y += rdt * 14; k.mesh.scale.setScalar(Math.max(0.01, 1 - k.anim * 0.8));
          if (k.anim >= 1) k.mesh.visible = false;
        }
      }
      for (const p of W.portals) for (const e of p.ends) e.disc.rotation.y -= dt * 3;
      for (const z of this.zoneAnims) { z.tex.offset.x += z.rate[0] * dt; z.tex.offset.y += z.rate[1] * dt; }
      if (ballState) {
        const d = Math.hypot(ballState.x - W.hx, ballState.z - W.hz);
        const glow = W.locked ? 0 : Math.max(0, 1 - d / 1.4) * (0.6 + 0.4 * Math.sin(t * 10));
        this.lipMat.color.copy(this.lipBase).lerp(cWhite, glow);
      }
    }
    if (this.squashT > 0) {
      this.squashT = Math.max(0, this.squashT - rdt);
      const k = this.squashT / 0.22, s = Math.sin(k * Math.PI) * 0.22;
      this.ball.scale.set(1 + s, 1 - s, 1 + s);
    }
    const speed = ballState ? Math.hypot(ballState.vx, ballState.vz) : 0;
    this.trail.update(dt, this.ball.position.x, this.ball.position.z, rolling, speed);
    this.particles.update(rdt);
    this.shake *= Math.exp(-rdt * 9);
    const sh = this.shake;
    this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * sh, this.camBase.y + (Math.random() - 0.5) * sh, this.camBase.z + (Math.random() - 0.5) * sh);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
