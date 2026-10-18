// YouTube as a music source. YouTube's embed terms require a visible player of at least 200x200 px with nothing
// over it, so it docks at the bottom of the screen (the course is fitted above it on portrait screens) rather
// than playing hidden. Players paste a video or playlist link; search would need an API key with a tiny quota.
let api = null, player = null, current = null, onDock = () => {};

export const available = () => __YOUTUBE__ && location.protocol.startsWith('http');
export const docked = () => !document.getElementById('ytDock').hidden;
export function onDockChange(fn) { onDock = fn; }

// Accepts watch, youtu.be, shorts, live, embed and playlist links (or a bare video id).
export function parse(text) {
  const s = String(text || '').trim();
  const video = s.match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})(?![\w-])/)?.[1] || (/^[\w-]{11}$/.test(s) ? s : null);
  const list = s.match(/[?&]list=([\w-]{10,})/)?.[1] || null;
  return video || list ? { video, list } : null;
}

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

function dock(on) {
  document.getElementById('ytDock').hidden = !on;
  document.body.classList.toggle('yt-on', on);
  onDock();
}

export async function play(src) {
  const YT = await loadApi();
  current = src;
  dock(true);
  if (player?.loadVideoById) {
    if (src.list) player.loadPlaylist({ list: src.list, listType: 'playlist' }); else player.loadVideoById(src.video);
    return;
  }
  if (!document.getElementById('ytPlayer')) { // destroy() removes the element the player was built in
    const el = document.createElement('div'); el.id = 'ytPlayer';
    document.getElementById('ytDock').appendChild(el);
  }
  player = new YT.Player('ytPlayer', {
    width: 200, height: 200, host: 'https://www.youtube-nocookie.com',
    videoId: src.list ? undefined : src.video,
    playerVars: { autoplay: 1, playsinline: 1, rel: 0, ...(src.list && { listType: 'playlist', list: src.list }) },
    events: {
      onReady: e => e.target.playVideo(), // phones may still want a tap on the player itself
      onStateChange: e => { if (e.data === YT.PlayerState.ENDED && !current?.list) e.target.playVideo(); }, // loop one video
    },
  });
}

export function stop() {
  if (player) { player.destroy(); player = null; }
  if (docked()) dock(false);
}
