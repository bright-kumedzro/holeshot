// Challenge API.
//   GET  /api/challenge?id=<id>&p=<playerId>      one challenge and its scoreboard
//   GET  /api/challenge?stats=<playerId>          that player's win record
//   GET  /api/challenge?ids=<a,b,c>&p=<playerId>  who has joined and finished each of those challenges
//   POST /api/challenge {action:'create', name, p, v, seed, ks}
//   POST /api/challenge {action:'join', id, name, p}       accepted: started playing
//   POST /api/challenge {action:'score', id, name, p, holes}
//   POST /api/challenge {action:'forget', p, ids}           delete this player's scores, accepts and record
import { openStore } from './_lib/store.js';
import { ApiError, viewChallenge, createChallenge, joinChallenge, submitScore, playerStats, summaries, forgetPlayer } from './_lib/challenges.js';

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
  if (q.has('stats')) return handle(db => playerStats(db, q.get('stats')));
  if (q.has('ids')) return handle(db => summaries(db, q.get('ids'), q.get('p')));
  return handle(db => viewChallenge(db, q.get('id'), q.get('p')));
}

export function POST(req) {
  return handle(async db => {
    const body = await req.json().catch(() => null);
    if (body?.action === 'create') return createChallenge(db, body);
    if (body?.action === 'join') return joinChallenge(db, body);
    if (body?.action === 'forget') return forgetPlayer(db, body);
    if (body?.action === 'score') return submitScore(db, body);
    throw new ApiError(400, 'Bad request');
  });
}
