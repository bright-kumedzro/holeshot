// Runs the Vercel functions in api/ inside a plain Node server (the Vite dev server and the smoke test),
// including the /c/:id rewrite from vercel.json. Without Upstash env vars they use the in-memory store.
import * as challenge from '../api/challenge.js';
import * as share from '../api/share.js';
import * as stats from '../api/stats.js';

const routes = { '/api/challenge': challenge, '/api/share': share, '/api/stats': stats };
const readBody = req => new Promise(r => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => r(s)); });

export async function apiMiddleware(req, res, next) {
  let url = new URL(req.url, `http://${req.headers.host}`);
  const share = url.pathname.match(/^\/c\/([^/]+)$/);
  if (share) url = new URL(`/api/share?id=${share[1]}`, url);
  const handler = routes[url.pathname]?.[req.method];
  if (!handler) return next();
  const body = req.method === 'POST' ? await readBody(req) : undefined;
  const out = await handler(new Request(url, { method: req.method, headers: { 'content-type': req.headers['content-type'] || '' }, body }));
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(await out.text());
}
