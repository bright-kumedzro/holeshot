import { COMPETE_HOLES, COMPETE_MAX_TRIES } from '../../src/config.js';

// Data model: hash ch:<id> holds `meta`, a `j:<playerId>` field per player who accepted (started playing) and a
// `p:<playerId>` field per player who finished (both HSETNX, so a player can only post once and simultaneous posts
// can't overwrite each other). List pl:<playerId> holds the challenges that player finished, newest first, for
// their win record. Player ids are anonymous, per device.
const TTL = 60 * 60 * 24 * 365;
const MAX_PLAYERS = 50;
const RECORD_SIZE = 100;
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ApiError(status, message); };

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ID_CHARS[b % ID_CHARS.length]).join('');
export const validId = id => typeof id === 'string' && /^[A-Za-z0-9]{6,12}$/.test(id);
const validPlayer = p => typeof p === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(p);
function cleanName(s) {
  const name = String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return name || fail(400, 'Add your name first.');
}

// Fewest shots first; a tie goes to whoever finished first.
const ranked = h => Object.entries(h).filter(([k]) => k.startsWith('p:'))
  .map(([k, v]) => ({ ...v, pid: k.slice(2) }))
  .sort((a, b) => a.shots - b.shots || a.at - b.at);

// Accepted but not finished yet, earliest first.
const playing = h => Object.entries(h).filter(([k]) => k.startsWith('j:') && !h[`p:${k.slice(2)}`])
  .map(([k, v]) => ({ ...v, pid: k.slice(2) }))
  .sort((a, b) => a.at - b.at);

function present(id, h, p) {
  const { meta } = h, players = ranked(h);
  return {
    id, v: meta.v, seed: meta.seed, ks: meta.ks, by: meta.by, at: meta.at, holes: COMPETE_HOLES,
    mine: meta.byP === p,
    players: players.map(({ pid, name, shots, holes, at }) => ({ name, shots, holes, at, you: pid === p })),
    playing: playing(h).map(({ pid, name, at }) => ({ name, at, you: pid === p })),
  };
}

// What the challenge list needs: who else has joined, how many finished, and where you stand.
function summarize(id, h, p) {
  const players = ranked(h), others = [...players, ...playing(h)].filter(x => x.pid !== p);
  const rank = players.findIndex(x => x.pid === p) + 1;
  return {
    id, by: h.meta.by, mine: h.meta.byP === p,
    joined: others.map(x => x.name), done: players.filter(x => x.pid !== p).length,
    rank, of: players.length, leader: players[0] ? { name: players[0].name, shots: players[0].shots } : null,
  };
}

async function load(db, id) {
  if (!validId(id)) fail(404, 'That challenge link isn’t right.');
  const h = await db.hgetall(`ch:${id}`);
  return h?.meta ? h : fail(404, 'That challenge has expired or never existed.');
}

export async function viewChallenge(db, id, p) { return present(id, await load(db, id), p); }

export async function createChallenge(db, { name, p, v, seed, ks }) {
  const by = cleanName(name);
  if (!validPlayer(p) || !isInt(v, 1, 1e6) || !isInt(seed, 0, 2 ** 32 - 1)) fail(400, 'Bad request');
  if (!Array.isArray(ks) || ks.length !== COMPETE_HOLES || !ks.every(k => isInt(k, 0, 4))) fail(400, 'Bad request');
  const meta = { v, seed, ks, by, byP: p, at: Date.now() };
  for (let i = 0; i < 3; i++) {
    const id = newId();
    if (await db.hsetnx(`ch:${id}`, 'meta', meta)) {
      await db.expire(`ch:${id}`, TTL);
      return present(id, { meta }, p);
    }
  }
  fail(500, 'Couldn’t create a challenge. Try again.');
}

// Accepting a challenge (tapping Play) tells its creator someone has taken it up.
export async function joinChallenge(db, { id, name, p }) {
  const who = cleanName(name);
  if (!validPlayer(p)) fail(400, 'Bad request');
  const h = await load(db, id);
  if (!h[`j:${p}`] && !h[`p:${p}`]) {
    if (Object.keys(h).filter(k => k.startsWith('j:')).length >= MAX_PLAYERS) fail(409, 'This challenge is full.');
    await db.hsetnx(`ch:${id}`, `j:${p}`, { name: who, at: Date.now() });
  }
  return viewChallenge(db, id, p);
}

export async function summaries(db, ids, p) {
  const list = String(ids || '').split(',').filter(validId).slice(0, 30);
  const all = await Promise.all(list.map(id => db.hgetall(`ch:${id}`)));
  return list.map((id, i) => (all[i]?.meta ? summarize(id, all[i], p) : { id, gone: true }));
}

export async function submitScore(db, { id, name, p, holes }) {
  const who = cleanName(name);
  if (!validPlayer(p)) fail(400, 'Bad request');
  if (!Array.isArray(holes) || holes.length !== COMPETE_HOLES || !holes.every(t => isInt(t, 1, COMPETE_MAX_TRIES + 1))) fail(400, 'Bad request');
  const key = `ch:${id}`, h = await load(db, id);
  if (!h[`p:${p}`]) {
    if (ranked(h).length >= MAX_PLAYERS) fail(409, 'This challenge is full.');
    const entry = { name: who, holes, shots: holes.reduce((a, b) => a + b, 0), at: Date.now() };
    if (await db.hsetnx(key, `p:${p}`, entry)) {
      await db.lpush(`pl:${p}`, id);
      await db.ltrim(`pl:${p}`, 0, RECORD_SIZE - 1);
      await db.expire(`pl:${p}`, TTL);
    }
  }
  return viewChallenge(db, id, p);
}

// A challenge counts as a game once at least two people have finished it; you win it if you're top.
export async function playerStats(db, p) {
  if (!validPlayer(p)) fail(400, 'Bad request');
  const ids = await db.lrange(`pl:${p}`, 0, RECORD_SIZE - 1);
  const all = await Promise.all(ids.map(id => db.hgetall(`ch:${id}`)));
  let played = 0, wins = 0, waiting = 0;
  for (const h of all) {
    if (!h?.meta) continue;
    const players = ranked(h);
    if (players.length < 2) { waiting++; continue; }
    played++;
    if (players[0].pid === p) wins++;
  }
  return { played, wins, waiting };
}
