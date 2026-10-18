// Prints Holeshot's anonymous play counts from the live site: totals, then a row per day.
// Usage: node scripts/stats.mjs [days=30] [site=https://playholeshot.vercel.app]
const days = Number(process.argv[2]) || 30;
const site = (process.argv[3] || 'https://playholeshot.vercel.app').replace(/\/$/, '');

const res = await fetch(`${site}/api/stats?days=${days}`);
if (!res.ok) { console.error(`${site}/api/stats answered ${res.status}: ${await res.text()}`); process.exit(1); }
const s = await res.json();
const num = v => v.toLocaleString('en-GB');

console.log(`Holeshot, counting since ${s.since || 'not started'}\n`);
console.table({
  'Players (all time)': num(s.players),
  'Active today (UTC)': num(s.activeToday),
  'Active this week': num(s.activeWeek),
  'Active this month': num(s.activeMonth),
  'Holes sunk': num(s.holes),
  'Shots taken': num(s.shots),
  'Challenges made': num(s.challenges),
  'Challenge games finished': num(s.finishes),
});
console.table(Object.fromEntries(s.days.map(({ day, ...row }) => [day, row])));
