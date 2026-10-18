import './analytics.js';

// About page: the public play counts from /api/stats (the panel stays hidden if they can't load), and the music
// credits from the same tracks.json the game reads, so there's one list to keep.
const stats = document.getElementById('stats');
fetch('./api/stats').then(r => (r.ok ? r.json() : Promise.reject())).then(s => {
  const num = new Intl.NumberFormat('en-GB');
  for (const b of stats.querySelectorAll('[data-k]')) b.textContent = num.format(s[b.dataset.k] || 0);
  const since = s.since && new Date(`${s.since}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  document.getElementById('statsNote').innerHTML = `Anonymous counts${since ? ` since ${since}` : ''}. Players are devices that have opened the game; this week starts on Monday. <a href="./privacy#counts">How we count</a>`;
  stats.hidden = false;
}).catch(() => {});

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const list = document.getElementById('credits');
fetch('./music/tracks.json').then(r => r.json()).then(tracks => {
  list.innerHTML = tracks.map(t => {
    const title = t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>` : esc(t.title);
    return `<li><i>${title}</i>${t.artist ? ` by ${esc(t.artist)}` : ''}</li>`;
  }).join('');
}).catch(() => {
  list.innerHTML = '<li>The track list couldn’t load. It’s also in the game, under Settings → Music credits.</li>';
});
