// Exercises the challenge and stats APIs against the in-memory store. Usage: node scripts/test-api.mjs
import { GET, POST } from '../api/challenge.js';
import { GET as share } from '../api/share.js';
import * as statsApi from '../api/stats.js';
import { periods } from '../src/periods.js';

let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? ' ok ' : 'FAIL'}  ${label}`); if (!cond) failed++; };
const call = async (method, q, body) => {
  const res = await (method === 'GET' ? GET : POST)(new Request(`http://x/api/challenge${q}`, body ? { method, body: JSON.stringify(body) } : { method }));
  return { status: res.status, data: await res.json() };
};
const A = 'aaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbb', C = 'cccccccccccccccccccc';
const ks = [0, 1, 0, 0, 2];

const made = await call('POST', '', { action: 'create', name: '  Ama <b> ', p: A, v: 1, seed: 123, ks });
ok(made.status === 200 && made.data.id && made.data.mine && made.data.by === 'Ama b', 'create cleans the name and marks it as yours');
const id = made.data.id;

ok((await call('POST', '', { action: 'create', name: '', p: A, v: 1, seed: 1, ks })).status === 400, 'create needs a name');
ok((await call('POST', '', { action: 'create', name: 'x', p: A, v: 1, seed: 1, ks: [9, 0, 0, 0, 0] })).status === 400, 'create rejects bad rerolls');

let r = await call('POST', '', { action: 'score', id, name: 'Ama', p: A, holes: [2, 1, 3, 1, 2] });
ok(r.status === 200 && r.data.players.length === 1 && r.data.players[0].shots === 9 && r.data.players[0].you, 'first score is stored');
r = await call('POST', '', { action: 'score', id, name: 'Ama', p: A, holes: [1, 1, 1, 1, 1] });
ok(r.data.players[0].shots === 9, 'a second post from the same player is ignored');
ok((await call('POST', '', { action: 'score', id, name: 'Kofi', p: B, holes: [1, 1, 1, 1, 8] })).status === 400, 'scores above the try cap are rejected');

let stats = (await call('GET', `?stats=${A}`)).data;
ok(stats.played === 0 && stats.waiting === 1, 'a challenge with one player is waiting, not played');

await call('POST', '', { action: 'score', id, name: 'Kofi', p: B, holes: [1, 2, 2, 1, 2] }); // 8 shots
await call('POST', '', { action: 'score', id, name: 'Esi', p: C, holes: [2, 2, 2, 1, 1] });  // 8 shots, later
r = await call('GET', `?id=${id}&p=${B}`);
ok(r.data.players.map(p => p.name).join() === 'Kofi,Esi,Ama' && r.data.players[0].you && !r.data.mine, 'ranked by shots, ties go to the earlier finisher');
ok(!('pid' in r.data.players[0]) && !JSON.stringify(r.data).includes(A), 'player ids are never sent out');

stats = (await call('GET', `?stats=${B}`)).data;
ok(stats.played === 1 && stats.wins === 1, 'the leader has 1 win from 1 game');
stats = (await call('GET', `?stats=${A}`)).data;
ok(stats.played === 1 && stats.wins === 0 && stats.waiting === 0, 'the creator has 0 wins from 1 game');

// accepting: a fourth player joins, shows as playing until they finish, and the creator's list sees it
const D = 'dddddddddddddddddddd';
r = await call('POST', '', { action: 'join', id, name: 'Yaw', p: D });
ok(r.status === 200 && r.data.playing.length === 1 && r.data.playing[0].name === 'Yaw' && r.data.playing[0].you, 'joining lists you as playing');
await call('POST', '', { action: 'join', id, name: 'Yaw', p: D });
ok((await call('GET', `?id=${id}&p=${A}`)).data.playing.length === 1, 'joining twice counts once');
await call('POST', '', { action: 'join', id, name: 'Kofi', p: B });
ok((await call('GET', `?id=${id}&p=${A}`)).data.playing.length === 1, 'someone who already finished is not listed as playing');
let sum = (await call('GET', `?ids=${id},nope99,../x&p=${A}`)).data;
ok(sum.length === 2 && sum[0].mine && sum[0].joined.join() === 'Kofi,Esi,Yaw' && sum[0].done === 2 && sum[0].rank === 3 && sum[1].gone, 'summaries list who joined, who finished and your rank');
await call('POST', '', { action: 'score', id, name: 'Yaw', p: D, holes: [3, 3, 3, 3, 3] });
r = await call('GET', `?id=${id}&p=${A}`);
ok(r.data.playing.length === 0 && r.data.players.length === 4, 'finishing moves a player from playing to the board');

ok((await call('GET', '?id=nope99&p=' + A)).status === 404, 'unknown challenge is a 404');
ok((await call('POST', '', { action: 'zap' })).status === 400, 'unknown action is a 400');

const html = await (await share(new Request(`https://playholeshot.vercel.app/api/share?id=${id}`))).text();
ok(html.includes('Ama b challenged you on Holeshot') && html.includes('Kofi leads with 8 shots') && html.includes('https://playholeshot.vercel.app/og.png'), 'share page has challenge Open Graph tags');
ok(html.includes(`/?challenge=${id}`), 'share page sends people on to the challenge');
const generic = await (await share(new Request('https://x/api/share?id=%3Cscript%3E'))).text();
ok(generic.includes('<title>Holeshot</title>') && !generic.includes('<script>alert'), 'bad ids get the generic preview');

// forgetting: Ama (the creator) deletes her data; her score goes, the challenge stays for the others, unnamed
r = await call('POST', '', { action: 'forget', p: A, ids: [id] });
ok(r.status === 200 && r.data.forgotten, 'forget succeeds');
r = await call('GET', `?id=${id}&p=${B}`);
ok(!r.data.players.some(p => p.name === 'Ama') && r.data.players.length === 3 && r.data.by === 'Someone', 'forgetting removes your score and your name as creator');
stats = (await call('GET', `?stats=${A}`)).data;
ok(stats.played === 0 && stats.waiting === 0, 'forgetting clears your record');
await call('POST', '', { action: 'forget', p: D, ids: [] }); // Yaw's device sends no ids: found through his record list
ok(!(await call('GET', `?id=${id}&p=${B}`)).data.players.some(p => p.name === 'Yaw'), 'forget finds challenges through the record list');

// anonymous play counts: the first read adds up the challenges already made, then reports and events add to totals
const statsCall = async (method, q = '', body) => {
  const res = await statsApi[method](new Request(`http://x/api/stats${q}`, body ? { method, body: JSON.stringify(body) } : { method }));
  return { status: res.status, data: await res.json() };
};
let st = (await statsCall('GET')).data;
ok(st.challenges === 1 && st.finishes === 2 && st.players === 0, 'first read counts the challenges already made');
ok((await statsCall('GET')).data.challenges === 1, 'and only once');
await statsCall('POST', '', { first: true, day: true, week: true, month: true, holes: 12, shots: 30 });
await statsCall('POST', '', { first: false, day: true, week: false, month: false, holes: 2, shots: 3 });
await statsCall('POST', '', { first: 'yes', holes: -5, shots: 1e9 });
ok((await statsCall('POST', '', 'nonsense')).status === 200, 'a malformed report is ignored');
st = (await statsCall('GET', '?days=3')).data;
ok(st.players === 1 && st.activeToday === 2 && st.activeWeek === 1 && st.activeMonth === 1, 'reports add to players and actives');
ok(st.holes === 14 && st.shots === 33 + 10000, 'hole and shot counts add up, capped per report');
ok(st.days.length === 3 && st.days[2].day === periods().day && st.days[2].new === 1 && st.days[2].active === 2, 'daily rows end today');
ok(st.days[2].holes === 2 && st.days[2].shots === 3 + 10000, 'a first report’s lifetime counts stay out of the daily rows');
await call('POST', '', { action: 'create', name: 'Kojo', p: 'kkkkkkkkkkkkkkkkkkkk', v: 1, seed: 7, ks });
ok((await statsCall('GET')).data.challenges === 2, 'new challenges are counted as they are made');
ok(periods(Date.UTC(2026, 0, 1)).week === '2026-W01' && periods(Date.UTC(2027, 0, 1)).week === '2026-W53' && periods(Date.UTC(2026, 9, 18)).week === '2026-W42', 'ISO weeks');

console.log(failed ? `\n${failed} check(s) failed` : '\nAPI checks pass');
process.exit(failed ? 1 : 0);
