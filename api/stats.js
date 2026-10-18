// Anonymous play counts.
//   GET  /api/stats            public totals: players, installs, active today / this week / this month, holes, shots,
//                              challenges
//   GET  /api/stats?days=30    the same plus a row per day, with returning players for retention
//   POST /api/stats {first, day, week, month, age, install, holes, shots, v}   one device's report (no ID)
import { openStore } from './_lib/store.js';
import { record, read } from './_lib/stats.js';

const json = (body, status = 200, cache = 'no-store') => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': cache },
});

async function handle(fn, cache) {
  const db = openStore();
  if (!db) return json({ error: 'Stats aren’t set up on this server yet.' }, 503);
  try { return json(await fn(db), 200, cache); }
  catch (e) { console.error(e); return json({ error: 'Something went wrong. Try again.' }, 500); }
}

// The CDN keeps totals for a minute, so a busy About page doesn't read the database on every visit.
export function GET(req) {
  const days = new URL(req.url).searchParams.get('days');
  return handle(db => read(db, days), 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
}

export function POST(req) {
  return handle(async db => record(db, await req.json().catch(() => null)));
}
