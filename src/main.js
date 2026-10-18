import './style.css';
import { boot } from './game.js';

boot();

// Offline support and home-screen install. Skipped in dev and when embedded in another page.
if ('serviceWorker' in navigator && !import.meta.env.DEV && window.self === window.top && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
