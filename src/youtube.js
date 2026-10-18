// YouTube as a music source. YouTube's embed terms require a visible player of at least 200x200 px with nothing
// over it, so it docks at the bottom of the screen (the course is fitted above it on portrait screens) rather
// than playing hidden. Players paste a video or playlist link; search would need an API key with a tiny quota.
// One player is created on first use and reused; every play/stop bumps `gen`, so a slow load can't resurrect it.
let api = null, ready = null, gen = 0, current = null, muted = false;
let onDock = () => {}, onError = () => {};

export const available = () => __YOUTUBE__ && location.protocol.startsWith('http');
export const docked = () => !document.getElementById('ytDock').hidden;
export function onDockChange(fn) { onDock = fn; }
export function onPlayError(fn) { onError = fn; }

// Accepts watch, youtu.be, shorts, live, embed, music.youtube and playlist links (or a bare video id). A "Mix"
// (list=RD…) is generated per viewer and can't be loaded by an embedded player, so only its video is kept.
export function parse(text) {
  const s = String(text || '').trim();
  const video = s.match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})(?![\w-])/)?.[1] || (/^[\w-]{11}$/.test(s) ? s : null);
  let list = s.match(/[?&]list=([\w-]{10,})/)?.[1] || null;
  if (list?.startsWith('RD')) list = null;
  return video || list ? { video, list } : null;
}

const ERRORS = {
  2: 'That link doesn’t point to a YouTube video.',
  5: 'That video can’t play here. Try another link.',
  100: 'That video is private or has been removed.',
  101: 'The owner doesn’t allow that video to play outside YouTube. Try another link.',
  150: 'The owner doesn’t allow that video to play outside YouTube. Try another link.',
};

function loadApi() {
  api ||= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { api = null; reject(new Error('Couldn’t load YouTube. Check your connection.')); };
    document.head.appendChild(s);
  });
  return api;
}

function player() {
  ready ||= loadApi().then(YT => new Promise(resolve => {
    if (!document.getElementById('ytPlayer')) { // destroy() takes the element the player was built in with it
      const el = document.createElement('div'); el.id = 'ytPlayer';
      document.getElementById('ytDock').appendChild(el);
    }
    new YT.Player('ytPlayer', { // the instance comes back through onReady
      width: 200, height: 200, host: 'https://www.youtube-nocookie.com',
      playerVars: { playsinline: 1, rel: 0 },
      events: {
        onReady: e => resolve(e.target),
        onStateChange: e => { if (e.data === YT.PlayerState.ENDED && !current?.list) e.target.playVideo(); }, // loop one video
        onError: e => onError(ERRORS[e.data] || 'That video can’t play here. Try another link.'),
      },
    });
  }));
  return ready;
}

function dock(on) {
  document.getElementById('ytDock').hidden = !on;
  document.body.classList.toggle('yt-on', on);
  onDock();
}

export async function play(src) {
  const my = ++gen;
  dock(true);
  const p = await player().catch(e => { ready = null; dock(false); throw e; });
  if (my !== gen) return;
  current = src;
  if (muted) p.mute(); else p.unMute();
  if (src.list) p.loadPlaylist({ list: src.list, listType: 'playlist' }); // phones may still want a tap on the player
  else p.loadVideoById(src.video);
}

export function stop() {
  gen++; current = null;
  if (ready) { const r = ready; ready = null; r.then(p => p.destroy(), () => {}); }
  if (docked()) dock(false);
}

export function setMuted(m) {
  muted = m;
  ready?.then(p => (m ? p.mute() : p.unMute()), () => {});
}
