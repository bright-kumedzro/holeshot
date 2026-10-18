// Bundles the game into one self-contained HTML fragment (no doctype/head) for publishing as a claude.ai Artifact.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true, minify: true, format: 'iife', target: 'es2020',
  write: false, outdir: 'artifact/tmp',
  // "dev" here only means: skip service-worker registration. Compete needs the API, which the artifact lacks,
  // and YouTube's player script isn't on the artifact's list of allowed script sources.
  define: { 'import.meta.env.DEV': 'true', __COMPETE__: 'false', __YOUTUBE__: 'false' },
  logLevel: 'warning',
});
const js = res.outputFiles.find(f => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\/script');
const css = res.outputFiles.find(f => f.path.endsWith('.css')).text;
const html = readFileSync('index.html', 'utf8');
const app = html.match(/<!--app-->([\s\S]*?)<!--\/app-->/)[1].trim();
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];

const out = `<title>Holeshot</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#2B7FC4">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>${css}</style>
${app}
<script>${js}</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/holeshot.html', out);
console.log(`artifact/holeshot.html  ${(out.length / 1024).toFixed(0)} KB`);
