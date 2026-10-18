import { periods } from '../../src/periods.js';

// Anonymous play counts. Nothing here can tell devices apart: each device says only "first time ever / today /
// this week / this month" and how many shots and holes since it last reported, and the server adds those to
// running totals. Hash st:all holds all-time totals plus `since` (when counting began); st:d:<day>, st:w:<week>
// and st:m:<month> hold each period's counts.
const TTL = 60 * 60 * 24 * 800;
const MAX_HOLES = 2000, MAX_SHOTS = 10000; // a device's first report carries its lifetime totals
const ALL = 'st:all';

const n = v => Number(v) || 0;
const clamp = (v, hi) => (Number.isInteger(v) && v > 0 ? Math.min(v, hi) : 0);

async function bump(db, key, fields, ttl = TTL) {
  const set = Object.entries(fields).filter(([, v]) => v > 0);
  if (!set.length) return;
  await Promise.all(set.map(([f, v]) => db.hincrby(key, f, v)));
  if (ttl) await db.expire(key, ttl);
}

async function start(db) { await db.hsetnx(ALL, 'since', Date.now()); }

// Retention: a device back on a later day says how many days since it was first counted. Each day keeps how many
// returned at all (ret) and exactly 1, 7 and 30 days after their first day (d1, d7, d30); divided by the `new` count
// of the day they started, that's day-1/7/30 retention.
const returns = age => ({ ret: age >= 1 ? 1 : 0, d1: age === 1 ? 1 : 0, d7: age === 7 ? 1 : 0, d30: age === 30 ? 1 : 0 });

// One device's report: { first, day, week, month } are true the first time in that period, holes and shots are counts,
// age is days since its first day (with `day`), install is true the first time it runs as an installed app.
export async function record(db, body) {
  const b = body && typeof body === 'object' ? body : {};
  const first = b.first === true ? 1 : 0, holes = clamp(b.holes, MAX_HOLES), shots = clamp(b.shots, MAX_SHOTS);
  const day = b.day === true ? 1 : 0, install = b.install === true ? 1 : 0;
  const p = periods(), today = first ? {} : { holes, shots }; // a first report's counts are history, not today's play
  await start(db);
  // retention counts only from cohorts that began after clients that remember their first day were out
  if (b.v === 2) await db.hsetnx(ALL, 'retSince', p.day);
  await Promise.all([
    bump(db, ALL, { players: first, holes, shots, installs: install }, 0),
    bump(db, `st:d:${p.day}`, { active: day, new: first, installs: install, ...today, ...(day ? returns(clamp(b.age, 3650)) : {}) }),
    bump(db, `st:w:${p.week}`, { active: b.week === true ? 1 : 0 }),
    bump(db, `st:m:${p.month}`, { active: b.month === true ? 1 : 0 }),
  ]);
  return { ok: true };
}

// Server-side events (a challenge created, a challenge finished), counted per day and all-time. Until the first read
// has added up the challenges already in the database, the all-time count is left to that.
export async function count(db, field) {
  const all = await db.hgetall(ALL);
  await Promise.all([all?.backfilled ? bump(db, ALL, { [field]: 1 }, 0) : null, bump(db, `st:d:${periods().day}`, { [field]: 1 })]);
}

// Challenges made before counting began are already in the database, so the first read adds them up once. (One
// made during that scan could be counted twice; it happens once, ever.)
async function backfill(db) {
  if (!(await db.hsetnx(ALL, 'backfilled', 1))) return;
  try {
    await start(db);
    const total = { challenges: 0, finishes: 0 };
    let cursor = '0';
    do { // SCAN pages follow one another
      const [next, keys] = await db.scan(cursor, { match: 'ch:*', count: 500 });
      cursor = String(next);
      for (const h of await Promise.all(keys.map(k => db.hgetall(k)))) tally(h, total);
    } while (cursor !== '0');
    await bump(db, ALL, total, 0);
  } catch (e) { await db.hdel(ALL, 'backfilled'); throw e; } // try again on the next read
}
function tally(h, total) {
  if (!h?.meta) return;
  total.challenges++;
  total.finishes += Object.keys(h).filter(k => k.startsWith('p:')).length;
}

// Public totals; with `days`, also the last few days' counts, oldest first.
export async function read(db, days = 0) {
  await backfill(db);
  const p = periods();
  const [all, d, w, m] = await Promise.all([ALL, `st:d:${p.day}`, `st:w:${p.week}`, `st:m:${p.month}`].map(k => db.hgetall(k)));
  const out = {
    since: all?.since ? new Date(n(all.since)).toISOString().slice(0, 10) : null, retentionSince: all?.retSince || null,
    players: n(all?.players), installs: n(all?.installs), holes: n(all?.holes), shots: n(all?.shots),
    challenges: n(all?.challenges), finishes: n(all?.finishes),
    activeToday: n(d?.active), activeWeek: n(w?.active), activeMonth: n(m?.active),
  };
  const span = Math.min(Math.max(0, Math.floor(n(days))), 120);
  if (span) {
    const keys = Array.from({ length: span }, (_, i) => periods(Date.now() - (span - 1 - i) * 864e5).day);
    const rows = await Promise.all(keys.map(k => db.hgetall(`st:d:${k}`)));
    const fields = ['active', 'new', 'ret', 'd1', 'd7', 'd30', 'installs', 'holes', 'shots', 'challenges', 'finishes'];
    out.days = keys.map((day, i) => ({ day, ...Object.fromEntries(fields.map(f => [f, n(rows[i]?.[f])])) }));
  }
  return out;
}
