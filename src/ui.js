import { WORLDS, BALLS, TRAILS, HOLES_PER_WORLD, GAME_NAME } from './config.js';
import { save, persist, worldUnlocked, holeUnlocked, worldStars, levelKey } from './save.js';
import { paintPreview } from './render/textures.js';

const svg = (d, fill = false) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>', true),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'),
  calendar: svg('<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/>'),
  infinity: svg('<path d="M12 12c-2-2.6-3.7-4-5.5-4a4 4 0 0 0 0 8c1.8 0 3.5-1.4 5.5-4zm0 0c2 2.6 3.7 4 5.5 4a4 4 0 0 0 0-8c-1.8 0-3.5 1.4-5.5 4z"/>'),
  bag: svg('<path d="M5 8h14l-1.2 11.2a1.8 1.8 0 0 1-1.8 1.6H8a1.8 1.8 0 0 1-1.8-1.6z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/><circle cx="12" cy="12" r="7"/>'),
  restart: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v5h5"/>'),
  star: svg('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/>', true),
  crown: svg('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>', true),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  key: svg('<circle cx="7.5" cy="12" r="4"/><path d="M11.5 12H21M17.5 12v3.5M20.5 12v2.5"/>'),
  sound: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.3 6.3a8 8 0 0 1 0 11.4"/>'),
  music: svg('<path d="M9 18V6l11-2.5v12"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="15.5" r="2.5" fill="currentColor"/>'),
  trophy: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8"/>'),
};

const $ = id => document.getElementById(id);
const SCREENS = ['scrTitle', 'scrLevels', 'scrShop', 'scrSettings'];
const MODALS = ['mdlPause', 'mdlResult', 'mdlRun'];
let H = {};
let shopTab = 'ball';
let toastTimer = 0;

export function initUI(handlers) {
  H = handlers;
  document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', ICONS[el.dataset.icon]));
  $('logo').textContent = GAME_NAME;
  $('aboutLine').textContent = `${GAME_NAME} v1.0 · Progress is saved on this device.`;
  $('btnPlay').onclick = () => H.play();
  $('btnLevels').onclick = () => showScreen('scrLevels');
  $('btnDaily').onclick = () => H.daily();
  $('btnEndless').onclick = () => H.endless();
  $('btnShop').onclick = () => showScreen('scrShop');
  $('btnSettings').onclick = () => showScreen('scrSettings');
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => showScreen('scrTitle'); });
  $('tabBall').onclick = () => { shopTab = 'ball'; renderShop(); };
  $('tabTrail').onclick = () => { shopTab = 'trail'; renderShop(); };
  $('btnPause').onclick = () => H.pause();
  $('btnResume').onclick = () => H.resume();
  $('btnRestart').onclick = () => H.restart();
  $('btnToLevels').onclick = () => H.toLevels();
  $('btnHome').onclick = () => H.home();
  $('btnSkip').onclick = () => H.skip();
  $('btnNext').onclick = () => H.resultNext();
  $('btnReplay').onclick = () => H.resultReplay();
  $('btnResMenu').onclick = () => H.toLevels();
  $('btnRunAgain').onclick = () => H.endless();
  $('btnRunMenu').onclick = () => H.home();
  const reset = $('btnReset');
  reset.onclick = () => {
    if (reset.classList.contains('armed')) { reset.classList.remove('armed'); reset.textContent = 'Reset progress'; H.resetProgress(); return; }
    reset.classList.add('armed'); reset.textContent = 'Tap again to erase everything';
    setTimeout(() => { reset.classList.remove('armed'); reset.textContent = 'Reset progress'; }, 3500);
  };
  document.addEventListener('click', e => { if (e.target.closest('button')) H.click(); }, true);
}

// ---------- screens & modals ----------
export function showScreen(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  if (id === 'scrTitle') renderTitle();
  if (id === 'scrLevels') renderLevels();
  if (id === 'scrShop') renderShop();
  if (id === 'scrSettings') renderSettings();
}
export const anyScreenOpen = () => SCREENS.some(s => !$(s).hidden) || MODALS.some(m => !$(m).hidden);
export function openModal(id) { for (const m of MODALS) $(m).hidden = m !== id; if (id === 'mdlPause') renderPauseQuick(); }
export function closeModals() { for (const m of MODALS) $(m).hidden = true; }
export function setPlaying(on) { $('hud').hidden = !on; $('foot').hidden = !on; if (!on) $('hand').hidden = true; }

function continueInfo() {
  for (let w = 0; w < WORLDS.length; w++) {
    if (!worldUnlocked(w)) break;
    for (let i = 0; i < HOLES_PER_WORLD; i++) if (!save.done[levelKey(w, i)]) return { w, i };
  }
  return null;
}

function renderTitle() {
  const c = continueInfo();
  $('playSub').textContent = c ? `${WORLDS[c.w].name} · Hole ${c.i + 1}${c.i === HOLES_PER_WORLD - 1 ? ' (boss)' : ''}` : 'Every world cleared · Endless';
  $('dailyBadge').hidden = !!save.daily.done[H.today()];
  let stars = 0; WORLDS.forEach((_, w) => { stars += worldStars(w); });
  const bits = [`${stars} stars`];
  if (save.endlessBest) bits.push(`Endless best ${save.endlessBest}`);
  if (save.daily.streak > 1) bits.push(`${save.daily.streak}-day streak`);
  $('statLine').textContent = bits.join(' · ');
}

function renderLevels() {
  const list = $('worldList'), cur = continueInfo();
  list.innerHTML = '';
  let total = 0, currentEl = null;
  WORLDS.forEach((W, w) => {
    const unlocked = worldUnlocked(w), ws = worldStars(w);
    total += ws;
    const card = document.createElement('article');
    card.className = 'world-card' + (unlocked ? '' : ' locked');
    card.style.setProperty('--wbg', W.palettes[0].bg);
    card.style.setProperty('--wfl', W.palettes[0].floor);
    card.innerHTML = `<div class="wc-head"><div><p class="eyebrow">World ${w + 1}</p><h3>${W.name}</h3><p class="blurb">${W.blurb}</p></div>
      <div class="wc-stars">${ICONS.star}<span>${ws}/${HOLES_PER_WORLD * 3}</span></div></div><div class="holes"></div>
      ${unlocked ? '' : `<p class="lock-note">${ICONS.lock}Beat the ${WORLDS[w - 1].name} boss to open</p>`}`;
    const grid = card.querySelector('.holes');
    for (let i = 0; i < HOLES_PER_WORLD; i++) {
      const id = levelKey(w, i), open = holeUnlocked(w, i), st = save.stars[id] || 0, boss = i === HOLES_PER_WORLD - 1;
      const b = document.createElement('button');
      b.className = 'hole-btn' + (boss ? ' boss' : '') + (open ? '' : ' locked');
      b.disabled = !open;
      b.setAttribute('aria-label', `Hole ${i + 1}${boss ? ', boss' : ''}${open ? `, ${st} of 3 stars` : ', locked'}`);
      b.innerHTML = open
        ? `<span>${boss ? ICONS.crown : i + 1}</span><span class="mini-stars">${[0, 1, 2].map(k => `<i class="${k < st ? 'on' : ''}"></i>`).join('')}</span>`
        : ICONS.lock;
      if (cur && cur.w === w && cur.i === i) { b.classList.add('current'); currentEl = card; }
      b.onclick = () => H.startWorldHole(w, i);
      grid.appendChild(b);
    }
    list.appendChild(card);
  });
  $('starTotal').innerHTML = `${ICONS.star}<span>${total}/${WORLDS.length * HOLES_PER_WORLD * 3}</span>`;
  if (currentEl && currentEl !== list.firstChild) requestAnimationFrame(() => currentEl.scrollIntoView({ block: 'start' }));
}

export function renderShop() {
  if ($('scrShop').hidden) return;
  $('tabBall').setAttribute('aria-selected', String(shopTab === 'ball'));
  $('tabTrail').setAttribute('aria-selected', String(shopTab === 'trail'));
  const grid = $('shopGrid'), items = shopTab === 'ball' ? BALLS : TRAILS;
  grid.innerHTML = '';
  for (const it of items) {
    const owned = save.owned[shopTab].includes(it.id), equipped = save.equip[shopTab] === it.id;
    const card = document.createElement('div');
    card.className = 'shop-card' + (equipped ? ' equipped' : '');
    const cv = document.createElement('canvas'); cv.width = 208; cv.height = 208;
    paintPreview(cv, shopTab === 'ball' ? it.id : save.equip.ball, shopTab === 'trail' ? it.id : null);
    const name = document.createElement('span'); name.className = 'name'; name.textContent = it.name;
    const btn = document.createElement('button');
    if (equipped) { btn.className = 'btn white'; btn.textContent = 'Equipped'; btn.disabled = true; }
    else if (owned) { btn.className = 'btn white'; btn.textContent = 'Use'; }
    else { btn.className = 'btn' + (save.coins < it.price ? ' poor' : ''); btn.innerHTML = `<i class="coin-ico"></i>${it.price}`; btn.setAttribute('aria-label', `Buy ${it.name} for ${it.price} coins`); }
    btn.onclick = () => H.shopAction(shopTab, it);
    card.append(cv, name, btn);
    grid.appendChild(card);
  }
}

const TOGGLES = [
  { key: 'sound', label: 'Sound effects' },
  { key: 'music', label: 'Music' },
  { key: 'haptics', label: 'Vibration', desc: navigator.vibrate ? 'On phones that support it' : 'This browser can’t vibrate' },
  { key: 'preview', label: 'Bounce preview', desc: 'Show where the ball will bounce off walls' },
  { key: 'fps', label: 'Show frame rate', desc: 'A small counter in the corner' },
];
const GRAPHICS = [
  { id: 'auto', label: 'Auto', desc: 'Drops resolution if the game runs slowly' },
  { id: 'high', label: 'High', desc: 'Sharpest, but may stutter on older phones' },
  { id: 'low', label: 'Low', desc: 'Smoother on older phones and easier on the battery' },
];
function renderSettings() {
  const list = $('settingsList');
  list.innerHTML = '';
  const set = (key, v) => { save.settings[key] = v; persist(); H.settingsChanged(key); renderSettings(); };
  for (const t of TOGGLES) {
    const b = document.createElement('button');
    b.className = 'toggle-row'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!save.settings[t.key]));
    b.innerHTML = `<span><strong>${t.label}</strong>${t.desc ? `<small>${t.desc}</small>` : ''}</span><span class="switch"></span>`;
    b.onclick = () => set(t.key, !save.settings[t.key]);
    list.appendChild(b);
  }
  const cur = GRAPHICS.find(g => g.id === save.settings.graphics) || GRAPHICS[0];
  const row = document.createElement('div');
  row.className = 'choice-row';
  row.innerHTML = `<span><strong id="gfxLabel">Graphics</strong><small>${cur.desc}</small></span><span class="seg" role="radiogroup" aria-labelledby="gfxLabel"></span>`;
  for (const g of GRAPHICS) {
    const b = document.createElement('button');
    b.textContent = g.label; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(g === cur));
    b.onclick = () => { if (g !== cur) set('graphics', g.id); };
    row.lastChild.appendChild(b);
  }
  list.appendChild(row);
}
function renderPauseQuick() {
  const q = $('pauseQuick');
  q.innerHTML = '';
  for (const [key, icon, label] of [['sound', 'sound', 'Sound effects'], ['music', 'music', 'Music']]) {
    const b = document.createElement('button');
    b.className = 'icon-btn'; b.innerHTML = ICONS[icon];
    b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(!!save.settings[key]));
    b.onclick = () => { save.settings[key] = !save.settings[key]; persist(); H.settingsChanged(); renderPauseQuick(); };
    q.appendChild(b);
  }
}

// ---------- HUD ----------
export function hudTrack(label, a, b, { aBoss = false, bBoss = false } = {}) {
  $('hudLabel').textContent = label;
  $('nodeA').innerHTML = a; $('nodeA').className = 'node' + (aBoss ? ' boss' : '');
  $('nodeB').innerHTML = b; $('nodeB').className = 'node next' + (bBoss ? ' boss' : '');
}
export function barFill(pct) {
  const f = $('barFill');
  if (pct === 0) { f.style.transition = 'none'; f.style.width = '0%'; void f.offsetWidth; f.style.transition = ''; }
  else f.style.width = pct + '%';
}
export function hudSub({ stars = null, keys = null, balls = null }) {
  let html = '';
  if (stars != null) html += `<span class="pot" aria-label="${stars} stars available">${[0, 1, 2].map(k => ICONS.star.replace('<svg', `<svg class="${k < stars ? '' : 'off'}"`)).join('')}</span>`;
  if (keys) html += `<span class="keys" aria-label="${keys.got} of ${keys.total} keys">${Array.from({ length: keys.total }, (_, k) => ICONS.key.replace('<svg', `<svg class="${k < keys.got ? 'got' : ''}"`)).join('')}</span>`;
  if (balls) html += `<span class="balls" aria-label="${balls.left} balls left">${Array.from({ length: balls.max }, (_, k) => `<i class="${k < balls.left ? '' : 'off'}"></i>`).join('')}</span>`;
  $('hudSub').innerHTML = html;
}
export const hint = text => { $('hint').textContent = text; };
export function fps(text) { const f = $('fps'); f.hidden = text == null; if (text != null) f.textContent = text; }
export const showSkip = on => { $('btnSkip').hidden = !on; };

export function setCoins(n, bump = false) {
  $('coinCount').textContent = n;
  if (bump) { const p = $('coinPill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
}
export function flyCoin(x, y, done) {
  const el = document.createElement('i');
  el.className = 'coin-ico fly';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  document.body.appendChild(el);
  const t = $('coinPill').getBoundingClientRect(), tx = t.left + 18, ty = t.top + t.height / 2;
  const anim = el.animate(
    [{ transform: 'translate(-50%,-50%) scale(1.2)' }, { transform: `translate(${tx - x}px, ${ty - y}px) translate(-50%,-50%) scale(0.7)` }],
    { duration: 650, easing: 'cubic-bezier(.5,0,.75,0)' },
  );
  anim.onfinish = () => { el.remove(); if (done) done(); };
}

export function banner(text, small = false) {
  const b = $('banner');
  b.textContent = text;
  b.className = 'banner' + (small ? ' small' : '');
  void b.offsetWidth;
  b.classList.add('pop');
}
export function combo(n) {
  const c = $('combo');
  c.textContent = `Combo x${n}`;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
}
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
export function hand(show, x = 0, y = 0) {
  const h = $('hand');
  if (show) { h.style.left = x + 'px'; h.style.top = y + 'px'; }
  if (h.hidden === show) h.hidden = !show;
}

// ---------- result cards ----------
export function showResult({ eyebrow, title, stars, lines, total, note, nextLabel }) {
  $('resEyebrow').textContent = eyebrow;
  $('resTitle').textContent = title;
  $('resStars').innerHTML = [0, 1, 2].map(k => ICONS.star.replace('<svg', `<svg class="${k < stars ? 'on' : ''}" style="animation-delay:${0.15 + k * 0.22}s"`)).join('');
  const rows = lines.map(([label, v]) => `<li><span>${label}</span><b><i class="coin-ico"></i>+${v}</b></li>`);
  if (lines.length > 1) rows.push(`<li class="total"><span>Total</span><b><i class="coin-ico"></i>+${total}</b></li>`);
  $('resLines').innerHTML = rows.join('');
  $('resNote').textContent = note || '';
  $('btnNext').textContent = nextLabel;
  openModal('mdlResult');
  for (let k = 0; k < stars; k++) setTimeout(() => H.starSound(k), 150 + k * 220);
}
export function showRunOver({ holes, best, isBest, coins }) {
  $('runHoles').textContent = holes;
  $('runTitle').textContent = isBest && holes > 0 ? 'New best!' : 'Out of balls';
  $('runSub').textContent = `${holes === 1 ? 'hole' : 'holes'} sunk · best ${best} · +${coins} coins`;
  openModal('mdlRun');
}
