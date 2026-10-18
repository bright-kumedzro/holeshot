import './style.css';
import { showFatal, webglAvailable } from './fatal.js';

// The game makes its WebGL renderer as soon as it loads, so it's loaded only once WebGL is known to work, and
// any error while starting lands here instead of leaving a blank screen.
if (!webglAvailable()) showFatal('webgl');
else import('./game.js').then(m => m.boot()).catch(e => { console.error(e); showFatal('crash'); });

// Offline support and home-screen install. Skipped in dev and when embedded in another page.
if ('serviceWorker' in navigator && !import.meta.env.DEV && window.self === window.top && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
