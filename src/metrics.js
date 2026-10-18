import { save, persist } from './save.js';
import { periods } from './periods.js';

// Anonymous play counts (see privacy.html). The device reports whether this is its first time ever, today, this
// week or this month; on a later day, how many days since it first opened the game (for retention); whether it's
// running as an installed app for the first time; and how many shots and holes since its last report. No ID,
// nickname or anything else that could tell devices apart is sent; the server only adds to totals. A failed report
// is simply sent again later.
const API = './api/stats';
const on = () => __COMPETE__ && location.protocol.startsWith('http');
// Opened from the home screen. On iPhone the installed app gets fresh storage of its own, but nobody installs
// without opening the site in the browser first, so an installed app never counts as a new player.
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
let busy = false;

function report() {
  const m = save.metrics, p = periods(), app = installed(), now = { holes: save.stats.holes, shots: save.stats.shots };
  const day = m.day !== p.day, first = !m.counted && !app;
  const age = day && m.firstDay ? daysBetween(m.firstDay, p.day) : 0; // unknown for devices counted before retention
  const body = {
    first, day, week: m.week !== p.week, month: m.month !== p.month,
    holes: Math.max(0, now.holes - m.sent.holes), shots: Math.max(0, now.shots - m.sent.shots),
    age, install: app && !m.app,
  };
  const empty = !Object.values(body).some(Boolean);
  const done = () => {
    Object.assign(m, { counted: true, day: p.day, week: p.week, month: p.month, sent: now, app: m.app || app });
    if (first) m.firstDay = p.day;
    persist();
  };
  return { body: JSON.stringify({ ...body, v: 2 }), empty, done };
}

// On launch and when the game comes back into view: an ordinary request. When it's hidden (maybe closing): a beacon,
// counted as sent once queued, so a report is never counted twice.
export async function flush(leaving = false) {
  if (!on() || busy) return;
  const r = report();
  if (r.empty) return;
  if (leaving) {
    if (navigator.sendBeacon?.(API, new Blob([r.body], { type: 'text/plain' }))) r.done();
    return;
  }
  busy = true;
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: r.body });
    await res.text(); // an unread body keeps the request open
    if (res.ok) r.done();
  } catch { /* offline: try again next time */ }
  busy = false;
}
