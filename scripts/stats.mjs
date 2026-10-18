// Prints Holeshot's anonymous play counts from the live site: totals, retention, then a row per day.
// Usage: node scripts/stats.mjs [days=30] [site=https://playholeshot.vercel.app]
const days = Math.min(Number(process.argv[2]) || 30, 90);
const site = (process.argv[3] || 'https://playholeshot.vercel.app').replace(/\/$/, '');

// 30 extra days, so day-30 retention has its starting days
const res = await fetch(`${site}/api/stats?days=${days + 30}`);
if (!res.ok) { console.error(`${site}/api/stats answered ${res.status}: ${await res.text()}`); process.exit(1); }
const s = await res.json();
const num = v => v.toLocaleString('en-GB');

// Day-k retention over the shown days: players back exactly k days after their first day, out of everyone who started
// on those first days. Only finished days count, and only first days after retention counting began.
function retention(k) {
  const today = s.days.at(-1).day, from = s.days.length - days;
  let back = 0, started = 0;
  for (let t = Math.max(from, k); t < s.days.length; t++) {
    const cohort = s.days[t - k];
    if (s.days[t].day === today || !s.retentionSince || cohort.day <= s.retentionSince) continue;
    back += s.days[t][`d${k}`]; started += cohort.new;
  }
  return started ? `${Math.round((100 * back) / started)}% (${back} of ${started})` : 'not enough data yet';
}

console.log(`Holeshot, counting since ${s.since || 'not started'}${s.retentionSince ? `, retention since ${s.retentionSince}` : ''}\n`);
console.table({
  'Players (all time)': num(s.players),
  'Installed as an app': num(s.installs),
  'Active today (UTC)': num(s.activeToday),
  'Active this week': num(s.activeWeek),
  'Active this month': num(s.activeMonth),
  'Holes sunk': num(s.holes),
  'Shots taken': num(s.shots),
  'Challenges made': num(s.challenges),
  'Challenge games finished': num(s.finishes),
});
console.log(`Retention over the last ${days} days`);
console.table({ 'Day 1': retention(1), 'Day 7': retention(7), 'Day 30': retention(30) });
console.table(Object.fromEntries(s.days.slice(-days).map(({ day, ...row }) => [day, row])));
