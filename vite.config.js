import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Writes a hash of the build output into dist/sw.js, so each deploy gets its own offline cache.
function stampServiceWorker() {
  let outDir, id;
  return {
    name: 'stamp-sw',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    generateBundle(_, bundle) {
      const h = createHash('sha1');
      for (const k of Object.keys(bundle).sort()) h.update(k).update(bundle[k].code ?? bundle[k].source);
      id = h.digest('hex').slice(0, 10);
    },
    closeBundle() {
      const file = resolve(outDir, 'sw.js'), src = readFileSync(file, 'utf8');
      if (!src.includes("'holeshot-__BUILD__'")) throw new Error('sw.js: cache name placeholder not found');
      writeFileSync(file, src.replace("'holeshot-__BUILD__'", `'holeshot-${id}'`));
    },
  };
}

// `npm run dev` serves the api/ functions too, backed by the in-memory store, and /about and /privacy the way
// Vercel's cleanUrls does.
const devApi = () => ({
  name: 'dev-api',
  async configureServer(server) {
    const { apiMiddleware } = await import('./scripts/api-dev.mjs');
    server.middlewares.use((req, res, next) => {
      if (/^\/(about|privacy)(\?|$)/.test(req.url)) req.url = req.url.replace(/^\/(about|privacy)/, '/$1.html');
      apiMiddleware(req, res, next).catch(next);
    });
  },
});

export default {
  base: './',
  // the single-file artifact build sets these to false: it has no server and may only load scripts from approved CDNs
  define: { __COMPETE__: 'true', __YOUTUBE__: 'true' },
  build: {
    target: 'es2020', chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: 'index.html', about: 'about.html', privacy: 'privacy.html' } },
  },
  plugins: [stampServiceWorker(), devApi()],
};
