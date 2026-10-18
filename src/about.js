// About page: lists the music credits from the same tracks.json the game reads, so there's one list to keep.
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
