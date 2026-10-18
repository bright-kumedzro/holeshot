# Holeshot

A 3D one-shot ball-into-hole game for the browser and phones. Drag back anywhere, aim, release, and get the ball in the cup.

- **5 worlds, 60 holes**: Breezy Park, Dune Drive, Frostbite, Neon Night and Lava Works. Hole 12 of each world is a boss, where you collect keys to unlock the cup.
- **Mechanics**: spinners, sliders, gates, pegs, triangle bumpers, pop bumpers, sand, ice, water and lava hazards, conveyor belts, boost pads, portals and moving holes.
- **Progression**: 1–3 stars per hole, coins on the course, a shop with 12 ball skins and 6 trails, a daily hole with a streak reward, and an endless mode with lives.
- **Feel**: slow motion when the ball drops, "Ooh!" near misses, camera shake, particles, synthesised sound and music, vibration, and a bounce preview.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, also reachable from a phone on the same Wi-Fi
npm run build      # production build in dist/ (works offline and installs as a PWA)
npm run preview    # serve dist/ locally
```

### Testing on a phone

Run `npm run dev` and open the `Network:` URL it prints on a phone connected to the same Wi-Fi. In Settings, turn on **Show frame rate** to see fps and the render scale (for example `60 fps · 2x`). **Graphics** is set to Auto by default: it lowers resolution, shadow detail and menu blur one step at a time while the frame rate stays under about 48 fps, and remembers the tier it settles on. To start detection again, pick Auto after choosing another option.

## Scripts

| Command | What it does |
| --- | --- |
| `node scripts/check-levels.mjs [n]` | Brute-force solver. Checks that all 60 campaign holes, today's daily hole and `n` endless holes have at least one sinking shot, that boss keys can be reached, and that nothing overlaps the ball start, the hole or a coin. Run it after editing levels. |
| `node scripts/smoke-test.mjs` | Runs `dist/` in your installed Chrome, headless. It expects Chrome at the default Windows path; elsewhere, set `CHROME_PATH`. Fails on console errors, fires a real shot, tours each mechanic, checks the graphics settings and that the game opens offline, and saves screenshots to `artifact/shots/`. Run `npm run build` first. |
| `npm run build:artifact` | Bundles everything into `artifact/holeshot.html`, a single self-contained page used for the shareable claude.ai preview. |

## Code map

```
src/
  config.js          tunables, worlds, shop catalogue, GAME_NAME
  geom.js            seeded RNG, rounded-rect outlines, polygon helpers
  physics.js         2D ball simulation in the floor plane: walls, rotating/moving bodies, zones, portals, pickups, hole capture, aim ray-cast
  levels/
    build.js         helpers for writing levels (box, spinner, slider, sand, portal, ...)
    handmade.js      the hand-built holes and the five bosses
    generator.js     seeded hole generator (obstacles placed in bands; gaps aimed at the ball-to-hole line)
    solver.js        shot search used by the generator and the check script
    index.js         maps world/daily/endless to levels, rerolls unfair seeds, prefetches the next hole in the background, places coins
  render/
    view.js          Three.js scene: course building, camera fit, aim guide, per-frame animation
    textures.js      procedural canvas textures (ball skins, floors, zones, portals)
    particles.js     pooled point-sprite particles
    trail.js         ribbon and particle trails
  audio.js           WebAudio sound effects and the music loop
  ui.js              menus, HUD, shop, results (DOM)
  game.js            game flow, input, scoring, saving
  save.js            localStorage progress
```

## Adding a hole

Edit `src/levels/handmade.js`. Coordinates are in world units: `x` runs across the course and `z` runs along it. The ball starts near `+z` and the hole sits toward `-z`. A typical course is about 4.6 wide and 9 long.

```js
{ w: 4.6, h: 9, rt: 2.3, rb: 0.6, hole: [0, -3], ball: [0, 3.1], hint: 'Time it',
  bodies: [...spinner(0, -0.5, 2.4, 1.4)], zones: [sand(0, 1, 3, 1)] }
```

Then run `node scripts/check-levels.mjs` to confirm the hole can be sunk.

## Renaming

The name appears in `GAME_NAME` (`src/config.js`), `<title>` in `index.html`, `public/manifest.webmanifest` and `scripts/build-artifact.mjs`.

## Deploying

The web build is hosted on Vercel from the GitHub repo. `vercel.json` sets the Vite build, the `dist/` output and the cache headers: hashed files in `assets/` are cached for a year, while `sw.js` and the manifest are checked on every visit.

The service worker loads the page network-first, so players get a new deploy on their next visit, and falls back to the cache when offline. The build stamps the cache name in `dist/sw.js` with a hash of the output (see `vite.config.js`). Each deploy therefore gets a fresh cache, and the old one is deleted.

## Shipping to app stores

Wrap the web build with [Capacitor](https://capacitorjs.com):

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init Holeshot com.yourname.holeshot --web-dir dist
npm run build && npx cap add android && npx cap open android
```

Before release, add PNG app icons (192 and 512 px). The manifest currently ships SVG icons, which Chrome accepts but some launchers don't.
