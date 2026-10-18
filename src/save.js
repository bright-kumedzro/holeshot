import { HOLES_PER_WORLD } from './config.js';

const KEY = 'holeshot.save.v1';

const defaults = () => ({
  coins: 0,
  stars: {},        // "w-i" -> best stars (0..3)
  done: {},         // "w-i" -> true once sunk or skipped
  coinsTaken: {},   // level id -> bitmask of coins already collected
  owned: { ball: ['classic'], trail: ['none'] },
  equip: { ball: 'classic', trail: 'none' },
  settings: { sound: true, music: true, haptics: true, preview: true, graphics: 'auto', fps: false, track: 'theme', youtube: '' },
  autoQuality: 0,   // QUALITY tier that auto mode settled on for this device
  daily: { last: '', streak: 0, done: {} },
  endlessBest: 0,
  player: { id: '', name: '' }, // anonymous compete identity, per device
  challenges: {},   // challenge id -> { by, at, holes: [shots per finished hole], tries, sent, rewarded }
  stats: { shots: 0, holes: 0, aces: 0 },
  metrics: { counted: false, day: '', week: '', month: '', sent: { holes: 0, shots: 0 } }, // last anonymous report (metrics.js)
});

function merge(a, b) {
  for (const k in b) {
    const av = a[k], bv = b[k];
    if (bv && typeof bv === 'object' && !Array.isArray(bv) && av && typeof av === 'object' && !Array.isArray(av)) merge(av, bv);
    else a[k] = bv;
  }
  return a;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(defaults(), JSON.parse(raw));
  } catch (e) { /* storage blocked or corrupt: start fresh */ }
  return defaults();
}

export const save = load();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

// Keeps the compete identity and challenge progress: they belong to a server-side record, not the campaign. Also
// keeps whether this device has been counted, so a reset isn't a new player; shot and hole counts start again from 0.
export function resetSave() {
  const keep = { player: save.player, challenges: save.challenges, metrics: { ...save.metrics, sent: { holes: 0, shots: 0 } } };
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, defaults(), keep);
  persist();
}

export const levelKey = (w, i) => `${w}-${i}`;
export const isDone = (w, i) => !!save.done[levelKey(w, i)];
export const worldUnlocked = w => w === 0 || isDone(w - 1, HOLES_PER_WORLD - 1);
export const holeUnlocked = (w, i) => worldUnlocked(w) && (i === 0 || isDone(w, i - 1));
export function worldStars(w) {
  let s = 0;
  for (let i = 0; i < HOLES_PER_WORLD; i++) s += save.stars[levelKey(w, i)] || 0;
  return s;
}
