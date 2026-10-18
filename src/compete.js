import { save, persist } from './save.js';
import { COMPETE_HOLES, LEVELS_VERSION } from './config.js';
import { prepareChallenge } from './levels/index.js';

// Async challenges: talks to /api/challenge and keeps this device's progress, so leaving mid-challenge
// resumes at the same hole and try instead of starting over.
const API = './api/challenge';
const KEEP = 30;

export const available = () => __COMPETE__ && location.protocol.startsWith('http');

function playerId() {
  // getRandomValues, unlike randomUUID, also works on plain-http LAN addresses used for phone testing
  if (!save.player.id) { save.player.id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); persist(); }
  return save.player.id;
}

async function call(query, init) {
  let res;
  try { res = await fetch(API + query, init); } catch { throw new Error('Couldn’t reach the server. Check your connection.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}
const post = body => call('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const fetchChallenge = id => call(`?id=${encodeURIComponent(id)}&p=${playerId()}`);
export const fetchStats = () => call(`?stats=${playerId()}`);
export const playable = ch => ch.v === LEVELS_VERSION;

// Checking that 5 fresh holes can be sunk takes a few seconds on a phone, so it starts in the background
// as soon as the Compete screen opens; by the time the player taps New challenge it's usually done.
let warm = null;
export function warmUp() {
  if (warm) return warm;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  warm = prepareChallenge(seed, COMPETE_HOLES).then(ks => ({ seed, ks }));
  return warm;
}

export async function createChallenge() {
  const { seed, ks } = await warmUp();
  warm = null;
  const ch = await post({ action: 'create', name: save.player.name, p: playerId(), v: LEVELS_VERSION, seed, ks });
  track(ch);
  return ch;
}

// Called when a player starts their holes, so the creator sees they've accepted.
export const joinChallenge = id => post({ action: 'join', id, name: save.player.name, p: playerId() });

// Who has joined and finished each recent challenge; `fresh` marks news since the player last opened it.
export async function fetchSummaries() {
  const ids = recent().map(([id]) => id);
  if (!ids.length) return [];
  const list = await call(`?ids=${ids.join(',')}&p=${playerId()}`);
  return list.map(s => ({ ...s, fresh: !s.gone && activity(s) !== save.challenges[s.id]?.seen }));
}
const activity = s => `${s.joined.length}:${s.done}`;
export function markSeen(view) {
  const rec = save.challenges[view.id];
  if (!rec) return;
  const others = [...view.players, ...view.playing].filter(x => !x.you);
  rec.seen = `${others.length}:${view.players.filter(x => !x.you).length}`;
  persist();
}

export async function submitScore(id) {
  const rec = save.challenges[id];
  const view = await post({ action: 'score', id, name: save.player.name, p: playerId(), holes: rec.holes });
  rec.sent = true; persist();
  return view;
}

// ---------- local progress ----------
export const progress = id => save.challenges[id];
export function track(ch) {
  if (!save.challenges[ch.id]) save.challenges[ch.id] = { by: ch.mine ? null : ch.by, at: Date.now(), holes: [], tries: 0, sent: false, rewarded: false, joined: false, seen: '0:0' };
  const ids = Object.keys(save.challenges).sort((a, b) => save.challenges[b].at - save.challenges[a].at);
  for (const id of ids.slice(KEEP)) delete save.challenges[id];
  persist();
  return save.challenges[ch.id];
}
export const finished = rec => rec.holes.length >= COMPETE_HOLES;
export const recent = () => Object.entries(save.challenges).sort(([, a], [, b]) => b.at - a.at);

// ---------- sharing ----------
export const link = id => `${location.origin}/c/${id}`;
export async function share(view) {
  const me = view.players.find(p => p.you);
  const text = me ? `I took ${me.shots} shots over ${view.holes} holes on Holeshot. Can you beat me?`
    : `I’m challenging you to ${view.holes} holes on Holeshot. Fewest shots wins!`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Holeshot challenge', text, url: link(view.id) }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(`${text} ${link(view.id)}`); return 'copied'; } catch { return 'failed'; }
}
