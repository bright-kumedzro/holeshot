import * as THREE from 'three';
import { mulberry32, hashStr } from '../geom.js';

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTexture(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (amt > 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const dot = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
// Draw a shape nine times so it tiles seamlessly across a size x size texture.
const wrap = (size, fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy); };

// ---------- ball skins (equirectangular 512 x 256) ----------
const PAINT = {
  classic(g) {
    g.fillStyle = '#FFD21F'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#FFAA00'; g.fillRect(0, 110, 512, 36);
    g.fillStyle = '#FFF3B0';
    for (const [x, y] of [[80, 48], [336, 60], [200, 204], [444, 192]]) dot(g, x, y, 16);
  },
  snow(g, rnd) {
    g.fillStyle = '#F6FBFF'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < 0.5 ? '#D3E8F7' : '#E6F2FB'; dot(g, rnd() * 512, rnd() * 256, 2 + rnd() * 6); }
  },
  eight(g) {
    g.fillStyle = '#15151C'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(128, 128, 56, 52, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#15151C'; g.font = 'bold 66px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('8', 128, 132);
  },
  beach(g) {
    ['#FF3B3B', '#FFFFFF', '#2F80ED', '#FFD21F', '#FFFFFF', '#27AE60'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 512 / 6, 0, 512 / 6 + 1, 256); });
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 512, 26); g.fillRect(0, 230, 512, 26);
  },
  melon(g) {
    g.fillStyle = '#4DB25A'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#1F6E2C'; g.lineWidth = 16;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      for (let y = 0; y <= 256; y += 8) { const x = i * 51.2 + Math.sin(y * 0.06 + i) * 9; y ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  },
  soccer(g) {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#1B1B22';
    const pent = (cx, cy, r) => {
      g.beginPath();
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.fill();
    };
    for (const [x, y] of [[64, 128], [192, 60], [192, 196], [320, 128], [448, 60], [448, 196], [0, 128], [512, 128], [128, 0], [384, 0], [128, 256], [384, 256]]) pent(x, y, 26);
  },
  mars(g, rnd) {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#E8743B'); gr.addColorStop(1, '#B73A10');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 34; i++) {
      const x = rnd() * 512, y = rnd() * 256, r = 4 + rnd() * 16;
      g.fillStyle = 'rgba(110,25,5,0.35)'; dot(g, x, y, r);
      g.fillStyle = 'rgba(255,190,140,0.22)'; dot(g, x - r * 0.25, y - r * 0.25, r * 0.6);
    }
  },
  disco(g, rnd) {
    g.fillStyle = '#4A4A55'; g.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 512; x += 16) {
      const v = (150 + rnd() * 105) | 0;
      g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 14)})`; g.fillRect(x + 1, y + 1, 14, 14);
    }
  },
  eye(g, rnd) {
    g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(220,60,60,0.55)'; g.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      let x = 256 + rnd() * 256, y = rnd() * 256;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (128 - x) * 0.12 + (rnd() - 0.5) * 30; y += (128 - y) * 0.12 + (rnd() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    const ir = g.createRadialGradient(128, 128, 8, 128, 128, 52);
    ir.addColorStop(0, '#6FD3FF'); ir.addColorStop(1, '#1A5FA8');
    g.fillStyle = ir; dot(g, 128, 128, 50);
    g.fillStyle = '#0B0B12'; dot(g, 128, 128, 22);
    g.fillStyle = '#FFFFFF'; dot(g, 142, 112, 8);
  },
  magma(g, rnd) {
    g.fillStyle = '#2A1212'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#FF6A1A'; g.shadowColor = '#FFB020'; g.shadowBlur = 10;
    for (let i = 0; i < 20; i++) {
      let x = rnd() * 512, y = rnd() * 256;
      g.lineWidth = 3 + rnd() * 3; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 7; s++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    g.shadowBlur = 0;
  },
  rainbow(g) {
    for (let x = 0; x < 512; x += 32) { g.fillStyle = `hsl(${(x / 512) * 360},90%,60%)`; g.fillRect(x, 0, 33, 256); }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 120, 512, 16);
  },
  galaxy(g, rnd) {
    g.fillStyle = '#0A0A26'; g.fillRect(0, 0, 512, 256);
    const cols = ['rgba(180,80,255,0.5)', 'rgba(255,80,180,0.4)', 'rgba(60,200,255,0.4)'];
    for (let i = 0; i < 8; i++) {
      const x = rnd() * 512, y = rnd() * 256, r = 40 + rnd() * 70, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, cols[i % 3]); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    }
    g.fillStyle = '#FFFFFF';
    for (let i = 0; i < 220; i++) dot(g, rnd() * 512, rnd() * 256, 0.5 + rnd() * 1.6);
  },
};
const SKIN_MAT = {
  eight: { roughness: 0.18 },
  disco: { metalness: 0.55, roughness: 0.22 },
  magma: { emissive: 1.3, roughness: 0.6 },
  galaxy: { emissive: 0.7, roughness: 0.3 },
  rainbow: { roughness: 0.25 },
};

function skinCanvas(id) {
  const key = `skin:${id}`;
  if (!cache.has(key)) {
    const [c, g] = makeCanvas(512, 256);
    (PAINT[id] || PAINT.classic)(g, mulberry32(hashStr(id)));
    cache.set(key, c);
  }
  return cache.get(key);
}

export function ballMaterial(id) {
  const map = toTexture(skinCanvas(id));
  const o = SKIN_MAT[id] || {};
  const m = new THREE.MeshStandardMaterial({ map, roughness: o.roughness ?? 0.35, metalness: o.metalness ?? 0.05 });
  if (o.emissive) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = map; m.emissiveIntensity = o.emissive; }
  return m;
}

// 2D previews for the shop. Draws the trail first so the ball sits on top of it.
export function paintPreview(cv, ballId, trailId) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const withTrail = trailId != null;
  const r = W * (withTrail ? 0.24 : 0.32), cx = withTrail ? W * 0.64 : W / 2, cy = withTrail ? H * 0.38 : H / 2;
  if (withTrail) paintTrail(g, trailId, cx, cy, r, W, H);
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  g.drawImage(skinCanvas(ballId), 0, 0, 256, 256, cx - r * 1.15, cy - r, r * 2.3, r * 2);
  const sh = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
  sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = sh; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
}

function paintTrail(g, id, cx, cy, r, W, H) {
  const ex = W * 0.12, ey = H * 0.9, rnd = mulberry32(hashStr(id));
  const along = t => [cx + (ex - cx) * t, cy + (ey - cy) * t];
  if (id === 'none') return;
  if (id === 'ribbon' || id === 'rainbow' || id === 'fire') {
    for (let i = 0; i < 24; i++) {
      const t = i / 24, [x, y] = along(t), w = r * 0.85 * (1 - t);
      g.fillStyle = id === 'ribbon' ? `rgba(255,255,255,${0.85 * (1 - t)})`
        : id === 'rainbow' ? `hsla(${t * 300},95%,60%,${0.9 * (1 - t)})`
        : `hsla(${45 - t * 40},100%,${60 - t * 15}%,${0.9 * (1 - t)})`;
      dot(g, x, y, w);
    }
  }
  if (id === 'sparkle' || id === 'fire' || id === 'bubbles') {
    for (let i = 0; i < 18; i++) {
      const t = rnd(), [x, y] = along(t), j = r * 0.9;
      const px = x + (rnd() - 0.5) * j * 2, py = y + (rnd() - 0.5) * j * 2;
      if (id === 'bubbles') { g.strokeStyle = 'rgba(190,233,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 3 + rnd() * 7, 0, Math.PI * 2); g.stroke(); }
      else { g.fillStyle = id === 'fire' ? (rnd() < 0.5 ? '#FFB020' : '#FF5A1F') : (rnd() < 0.5 ? '#FFFFFF' : '#FFE27A'); dot(g, px, py, 1.5 + rnd() * 3); }
    }
  }
}

// ---------- floors: one 256px tile spans 4 world units ----------
export function floorTexture(style, color) {
  const key = `floor:${style}:${color}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = makeCanvas(256, 256), rnd = mulberry32(hashStr(key));
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  if (style === 'lawn') {
    g.fillStyle = shade(color, 0.07);
    for (let y = 0; y < 256; y += 128) g.fillRect(0, y, 256, 64); // mower stripes, 1 unit wide
  } else if (style === 'dunes') {
    g.strokeStyle = shade(color, -0.07); g.lineWidth = 3;
    for (let y = 16; y < 256; y += 32) {
      g.beginPath();
      for (let x = 0; x <= 256; x += 8) { const yy = y + Math.sin((x / 256) * Math.PI * 4 + y) * 6; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      g.stroke();
    }
  } else if (style === 'ice') {
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 5; i++) {
      const x = rnd() * 256, y = rnd() * 256, l = 40 + rnd() * 60;
      g.lineWidth = 6 + rnd() * 10;
      wrap(256, (ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + l, y + oy - l * 0.6); g.stroke(); });
    }
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const pts = [[rnd() * 256, rnd() * 256]];
      for (let s = 0; s < 4; s++) { const [px, py] = pts[pts.length - 1]; pts.push([px + (rnd() - 0.5) * 50, py + (rnd() - 0.5) * 50]); }
      wrap(256, (ox, oy) => { g.beginPath(); pts.forEach(([x, y], i2) => (i2 ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy))); g.stroke(); });
    }
  } else if (style === 'grid') {
    g.strokeStyle = shade(color, 0.28); g.lineWidth = 2;
    g.shadowColor = shade(color, 0.5); g.shadowBlur = 6;
    for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    g.shadowBlur = 0;
  } else if (style === 'basalt') {
    g.strokeStyle = shade(color, -0.3); g.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const pts = [[rnd() * 256, rnd() * 256]];
      for (let s = 0; s < 3; s++) { const [px, py] = pts[pts.length - 1]; pts.push([px + (rnd() - 0.5) * 80, py + (rnd() - 0.5) * 80]); }
      wrap(256, (ox, oy) => { g.beginPath(); pts.forEach(([x, y], i2) => (i2 ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy))); g.stroke(); });
    }
    g.fillStyle = 'rgba(255,120,40,0.18)';
    for (let i = 0; i < 18; i++) dot(g, rnd() * 256, rnd() * 256, 1 + rnd() * 2.5);
  }
  const t = toTexture(c, true);
  t.repeat.set(0.25, 0.25);
  cache.set(key, t);
  return t;
}

// ---------- zones: textures tile once per ZONE_PERIOD world units ----------
export const ZONE_PERIOD = { sand: 2, ice: 2, water: 2, lava: 2, conveyor: 0.8, boost: 0.6 };

export function zoneTexture(type) {
  const key = `zone:${type}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = makeCanvas(128, 128), rnd = mulberry32(hashStr(key));
  if (type === 'sand') {
    g.fillStyle = '#EBC983'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 160; i++) { g.fillStyle = rnd() < 0.5 ? '#D8AE63' : '#F6DDA6'; dot(g, rnd() * 128, rnd() * 128, 0.8 + rnd() * 1.6); }
  } else if (type === 'ice') {
    g.fillStyle = '#E6F7FF'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6;
    wrap(128, (ox, oy) => { g.beginPath(); g.moveTo(10 + ox, 100 + oy); g.lineTo(70 + ox, 40 + oy); g.stroke(); });
  } else if (type === 'water') {
    g.fillStyle = '#2E9BF0'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(160,220,255,0.7)'; g.lineWidth = 3;
    for (let y = 16; y < 128; y += 32) {
      g.beginPath();
      for (let x = 0; x <= 128; x += 4) { const yy = y + Math.sin((x / 128) * Math.PI * 4) * 4; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      g.stroke();
    }
  } else if (type === 'lava') {
    g.fillStyle = '#FF4A12'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 16; i++) {
      const x = rnd() * 128, y = rnd() * 128, r = 6 + rnd() * 14;
      wrap(128, (ox, oy) => {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(255,220,90,0.95)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
        g.fillStyle = gr; dot(g, x + ox, y + oy, r);
      });
    }
  } else if (type === 'conveyor') {
    g.fillStyle = '#30344A'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#FFD21F';
    g.beginPath(); g.moveTo(24, 16); g.lineTo(64, 64); g.lineTo(24, 112); g.lineTo(52, 112); g.lineTo(92, 64); g.lineTo(52, 16); g.closePath(); g.fill();
  } else if (type === 'boost') {
    g.fillStyle = '#FF8A00'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#FFF3B0';
    g.beginPath(); g.moveTo(20, 10); g.lineTo(70, 64); g.lineTo(20, 118); g.lineTo(54, 118); g.lineTo(104, 64); g.lineTo(54, 10); g.closePath(); g.fill();
  }
  const t = toTexture(c, true);
  cache.set(key, t);
  return t;
}

export function swirlTexture() {
  const key = 'swirl';
  if (cache.has(key)) return cache.get(key);
  const [c, g] = makeCanvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0.1)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5; g.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    g.beginPath();
    for (let t = 0; t < 1; t += 0.02) { const a = arm * (Math.PI * 2 / 3) + t * 5, rr = 6 + t * 54; g.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); }
    g.stroke();
  }
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

export function lidTexture() {
  const key = 'lid';
  if (cache.has(key)) return cache.get(key);
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = '#FF2E88'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#FFFFFF';
  dot(g, 64, 50, 18);
  g.beginPath(); g.moveTo(52, 56); g.lineTo(76, 56); g.lineTo(82, 96); g.lineTo(46, 96); g.closePath(); g.fill();
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}
