# Holeshot

A 3D one-shot ball-into-hole game for the browser and phones. Drag back anywhere, aim, release, and get the ball in the cup.

- **5 worlds, 60 holes**: Breezy Park, Dune Drive, Frostbite, Neon Night and Lava Works. Hole 12 of each world is a boss, where you collect keys to unlock the cup.
- **Mechanics**: spinners, sliders, gates, pegs, triangle bumpers, pop bumpers, sand, ice, water and lava hazards, conveyor belts, boost pads, portals and moving holes.
- **Progression**: 1–3 stars per hole, coins on the course, a shop with 12 ball skins and 6 trails, a daily hole with a streak reward, and an endless mode with lives.
- **Compete**: create a 5-hole challenge, send the invite link, and play your own holes whenever you like; whoever takes the fewest shots wins. The creator sees who has accepted (started playing) and who has finished, the challenge screen refreshes while open, and the Compete tile shows a badge when there's news. No accounts: players type a nickname, and each device keeps an anonymous ID with a record of wins out of games played.
- **Music**: players pick from the built-in synthesised theme, tracks from Pixabay, a YouTube video or playlist, or Off (play your own). They can switch from Settings or mid-hole from the pause menu. The speaker button mutes all game audio, YouTube included.
- **Play counts**: the game reports anonymous counts (first time ever, today, this week and this month; on a later day, days since it first opened, for retention; its first launch as an installed app; plus shots and holes since the last report), with no ID of any kind. An installed app never counts as a new player, since iPhone gives it fresh storage but everyone installs from the browser. The server keeps only running totals, which are public on the About page and at `/api/stats`. Page views, referrers and countries come from Vercel Web Analytics (cookieless), shown in the Vercel dashboard.
- **Feel**: slow motion when the ball drops, "Ooh!" near misses, camera shake, particles, synthesised sound and music, vibration, and a bounce preview.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, also reachable from a phone on the same Wi-Fi; serves api/ with an in-memory store
npm run build      # production build in dist/ (works offline and installs as a PWA)
npm run preview    # serve dist/ locally
```

### Testing on a phone

Run `npm run dev` and open the `Network:` URL it prints on a phone connected to the same Wi-Fi. In Settings, turn on **Show frame rate** to see fps and the render scale (for example `60 fps · 2x`). **Graphics** is set to Auto by default: it lowers resolution, shadow detail and menu blur one step at a time while the frame rate stays under about 48 fps, and remembers the tier it settles on. To start detection again, pick Auto after choosing another option.

## Scripts

| Command | What it does |
| --- | --- |
| `node scripts/check-levels.mjs [n]` | Brute-force solver. Checks that all 60 campaign holes, today's daily hole, `n` endless holes and three sample challenges have at least one sinking shot, that boss keys can be reached, and that nothing overlaps the ball start, the hole or a coin. Run it after editing levels. |
| `node scripts/smoke-test.mjs` | Runs `dist/` in your installed Chrome, headless. It expects Chrome at the default Windows path; elsewhere, set `CHROME_PATH`. Fails on console errors, fires a real shot, tours each mechanic, checks the graphics settings, drives Compete (invite first, play all 5 holes, accept by link, news badge, send a score, win record), checks music (a track streams, YouTube docks and mutes) and checks that the game opens offline, and saves screenshots to `artifact/shots/`. Run `npm run build` first. |
| `node scripts/test-api.mjs` | Tests the challenge and stats APIs against the in-memory store: validation, one score per player, ranking, win records, the share page, and play counts. Run it after changing `api/`. |
| `node scripts/stats.mjs [days] [site]` | Prints the live play counts: players, installs, active today, this week and this month, holes, shots and challenges; day-1, day-7 and day-30 retention; then a row per day (30 days by default). It reads the public `/api/stats`, so it needs no keys. |
| `node scripts/make-og.mjs` | Redraws `public/og.png`, the link-preview image. |
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
    index.js         maps world/daily/endless/challenge to levels, rerolls unfair seeds, prefetches the next hole in the background, places coins
  render/
    view.js          Three.js scene: course building, camera fit, aim guide, per-frame animation
    textures.js      procedural canvas textures (ball skins, floors, zones, portals)
    particles.js     pooled point-sprite particles
    trail.js         ribbon and particle trails
  audio.js           WebAudio sound effects and the music loop
  ui.js              menus, HUD, shop, results (DOM)
  game.js            game flow, input, scoring, saving
  fatal.js           full-screen message when the game can't run: no WebGL, a crash while starting, graphics lost
  compete.js         challenge API calls, anonymous player ID, local challenge progress, sharing
  metrics.js         anonymous play-count reports to /api/stats (no ID)
  analytics.js       Vercel Web Analytics (page views, referrers, countries), only on the https site
  periods.js         UTC day, ISO week and month keys, shared with the stats API
  save.js            localStorage progress
  tokens.css         colours, fonts and gutters shared by the game (style.css) and the pages (page.css)
  page.css, about.js styles for about.html and privacy.html; about.js lists credits from tracks.json
about.html           /about: how to play, modes, installing, credits
privacy.html         /privacy: what's stored where and for how long, YouTube terms, deleting Compete data
404.html             "Out of bounds" page Vercel serves for unknown addresses (uses <base href="/"> so it works at any depth)
api/                 Vercel functions
  challenge.js       create a challenge, post a score, read a scoreboard or a player's win record
  share.js           /c/<id> share page with Open Graph tags, which forwards to the game
  stats.js           anonymous play counts: devices report, anyone can read the totals
  _lib/              challenge rules, play-count totals and the Redis store (in-memory when there's no database)
```

## Adding a hole

Edit `src/levels/handmade.js`. Coordinates are in world units: `x` runs across the course and `z` runs along it. The ball starts near `+z` and the hole sits toward `-z`. A typical course is about 4.6 wide and 9 long.

```js
{ w: 4.6, h: 9, rt: 2.3, rb: 0.6, hole: [0, -3], ball: [0, 3.1], hint: 'Time it',
  bodies: [...spinner(0, -0.5, 2.4, 1.4)], zones: [sand(0, 1, 3, 1)] }
```

Then run `node scripts/check-levels.mjs` to confirm the hole can be sunk.

## Adding music

Download a track from [Pixabay Music](https://pixabay.com/music/). Its licence allows use in a game without payment or credit, but tracks can't be redistributed on their own. Put the MP3 in `public/music/` and add it to `public/music/tracks.json`:

```json
[
  { "file": "sunny-arcade.mp3", "title": "Sunny Arcade", "artist": "Artist Name" }
]
```

It then appears in the picker and in **Settings → Music credits**; no code changes are needed. Add `"url"` with the track's Pixabay page to link its credit. The smoke test fails if a listed file is missing or an MP3 isn't listed. Tracks stream and loop, and switching between them crossfades. Keep the file names stable: MP3s are cached for 30 days. The offline cache skips music, so offline players hear the built-in theme.

**YouTube:** players paste a video or playlist link. YouTube's embed terms require the player to stay visible at 200×200 px or more with nothing covering it. So it docks at the bottom of the screen (bottom right on wide screens), and on portrait screens the course is fitted above it. The player loads from `youtube-nocookie.com`. The single-file artifact leaves YouTube and Compete out (`__YOUTUBE__` and `__COMPETE__` in `scripts/build-artifact.mjs`).

## Renaming

The name appears in `GAME_NAME` (`src/config.js`), `<title>` in `index.html`, `public/manifest.webmanifest` and `scripts/build-artifact.mjs`.

## Deploying

The web build is hosted on Vercel from the GitHub repo. `vercel.json` sets the Vite build, the `dist/` output and the cache headers: hashed files in `assets/` are cached for a year, while `sw.js` and the manifest are checked on every visit.

The service worker loads the page network-first, so players get a new deploy on their next visit, and falls back to the cache when offline. The build stamps the cache name in `dist/sw.js` with a hash of the output (see `vite.config.js`). Each deploy therefore gets a fresh cache, and the old one is deleted. It never caches `api/` or `/c/` responses.

Compete stores challenges in a free Upstash Redis database in London. The functions run in Vercel's London region (`lhr1`) to sit next to it. Vercel needs `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set as environment variables. Without them, the API answers 503 and the rest of the game still works.

`/about` and `/privacy` are extra Vite pages (see `build.rollupOptions.input`), served without `.html` by `cleanUrls`. Settings links to both. If you change what the game stores or which services it uses, update `privacy.html` and its date. YouTube's embed terms require the policy. **Delete my Compete data** in Settings calls the API's `forget` action. It removes the player's scores, accepts and record, and blanks their name on challenges they created.

Challenges store a seed plus the reroll each hole settled on, not the hole layouts. If a change to the generator or physics alters generated holes, bump `LEVELS_VERSION` in `src/config.js`. Older challenges then show a "made on an older version" message instead of building different holes.

## Shipping to app stores

Wrap the web build with [Capacitor](https://capacitorjs.com):

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init Holeshot com.yourname.holeshot --web-dir dist
npm run build && npx cap add android && npx cap open android
```

Before release, add PNG app icons (192 and 512 px). The manifest currently ships SVG icons, which Chrome accepts but some launchers don't.

## Credits

Music from [Pixabay](https://pixabay.com/music/), used under the Pixabay Content License, which doesn't require credit. The artists get it anyway:

- *Positive Funk Groove* by Universfield
- *Groove Machine* by Diamond Tunes
- *Fun Funk* by Tunetank
- *Funky Funk Beat* by Sosin
- *Upbeat* by Alex Morgan
- *Upbeat* by Sub Clair
- *Uplifting Action Rock* by Ikoliks
- *Club* by MiromaxMusic
- *Chill Boom* by Alex MakeMusic
- *Sunset Next to You* by JoackKenny
- *Everyday Is a Holiday* by Brotheration Records
- *Locust (Chill Rasta Reggae)* by Brotheration Records
- *Halloween Waltz* by BombinSound

The same list appears in the game under Settings → Music credits. It's built from `public/music/tracks.json`, so keep the two in step.
