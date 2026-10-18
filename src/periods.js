// The UTC day, ISO week and month a moment falls in, e.g. { day: '2026-10-18', week: '2026-W42', month: '2026-10' }.
// Shared by the game (to ping once per period) and the stats API (to file the counts), so both cut periods the same way.
export function periods(t = Date.now()) {
  const day = new Date(t).toISOString().slice(0, 10);
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // the Thursday of this week decides its year
  const week = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  return { day, week: `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, month: day.slice(0, 7) };
}
