// /c/<id> (rewritten here by vercel.json): a tiny page whose Open Graph tags describe the challenge, so the
// link shows a proper preview in chat apps, which then sends people on to the game.
import { openStore } from './_lib/store.js';
import { viewChallenge, validId } from './_lib/challenges.js';

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export async function GET(req) {
  const url = new URL(req.url), id = url.searchParams.get('id') || '';
  let title = 'Holeshot', desc = 'One shot, one hole. A 3D flick-the-ball puzzle game you can play in your browser.';
  try {
    const db = openStore();
    if (db && validId(id)) {
      const ch = await viewChallenge(db, id, '');
      const best = ch.players[0];
      title = `${ch.by} challenged you on Holeshot`;
      desc = best
        ? `${ch.holes} holes, fewest shots wins. ${best.name} leads with ${best.shots} shots. Can you beat that?`
        : `${ch.holes} holes, fewest shots wins. Can you beat ${ch.by}?`;
    }
  } catch { /* expired or unknown challenge: the generic preview still works */ }
  const target = validId(id) ? `/?challenge=${id}` : '/';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Holeshot">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url.origin + '/c/' + id)}">
<meta property="og:image" content="${esc(url.origin)}/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${target}">
</head><body style="background:#2B7FC4"><script>location.replace(${JSON.stringify(target)})</script>
<p><a href="${target}">Open the challenge</a></p></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
}
