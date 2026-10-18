// A full-screen message for when the game can't run or has stopped: no WebGL, a crash while starting, or the
// graphics context lost. Always offers a way forward (reload, or read about the game).
const MESSAGES = {
  webgl: ['Your browser can’t show 3D', 'Holeshot needs WebGL. Try updating your browser, turning on hardware acceleration in its settings, or opening the game in Chrome, Safari, Edge or Firefox.'],
  crash: ['Something went wrong', 'The game hit a problem while starting. Reloading usually fixes it.'],
  lost: ['The graphics took a break', 'Your device paused the 3D graphics, which can happen after the game sits in the background. Tap below to pick up where you left off.'],
};

export function showFatal(kind) {
  if (document.getElementById('fatal')) return;
  const [title, text] = MESSAGES[kind] || MESSAGES.crash;
  const about = __COMPETE__ ? './about' : 'https://playholeshot.vercel.app/about';
  const el = document.createElement('section');
  el.id = 'fatal'; el.className = 'fatal'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-labelledby', 'fatalTitle');
  el.innerHTML = `<div class="fatal-card"><div class="fatal-logo" aria-hidden="true">Holeshot</div><h2 id="fatalTitle">${title}</h2><p>${text}</p>`
    + `<button class="btn" id="fatalReload">${kind === 'lost' ? 'Tap to reload' : 'Reload'}</button>`
    + (kind === 'webgl' ? `<a class="fine" href="${about}">About Holeshot</a>` : '') + '</div>';
  document.body.appendChild(el);
  document.getElementById('fatalReload').onclick = () => location.reload();
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}
