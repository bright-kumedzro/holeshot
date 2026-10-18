// Challenge API.
//   GET  /api/challenge?id=<id>&p=<playerId>      one challenge and its scoreboard
//   GET  /api/challenge?stats=<playerId>          that player's win record
//   POST /api/challenge {action:'create', name, p, v, seed, ks}
//   POST /api/challenge {action:'score', id, name, p, holes}
import { openStore } from './_lib/store.js';
import { ApiError, viewChallenge, createChallenge, submitScore, playerStats } from './_lib/challenges.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

async function handle(fn) {
  const db = openStore();
  if (!db) return json({ error: 'Compete isn’t set up on this server yet.' }, 503);
  try { return json(await fn(db)); }
  catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong. Try again.' }, 500);
  }
}

export function GET(req) {
  const q = new URL(req.url).searchParams;
  return handle(db => (q.has('stats') ? playerStats(db, q.get('stats')) : viewChallenge(db, q.get('id'), q.get('p'))));
}

export function POST(req) {
  return handle(async db => {
    const body = await req.json().catch(() => null);
    if (body?.action === 'create') return createChallenge(db, body);
    if (body?.action === 'score') return submitScore(db, body);
    throw new ApiError(400, 'Bad request');
  });
}
