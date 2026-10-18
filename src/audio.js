import { save } from './save.js';

// Everything is synthesised with WebAudio: no audio files to load.
let ac = null, master = null, sfxBus = null, musicBus = null;
let lastBounce = 0;

export function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    } catch (e) { ac = null; return; }
    applyAudio();
  }
  if (ac.state !== 'running') ac.resume(); // 'suspended', or 'interrupted' on iOS after a call or app switch
  if (file?.el.paused && !document.hidden) file.el.play().catch(() => {}); // a play() refused before the first real tap
}

export function applyAudio() {
  // with music off, 'ambient' lets iOS keep the player's own music (Spotify etc.) going under the sound effects
  if (navigator.audioSession) navigator.audioSession.type = save.settings.music ? 'auto' : 'ambient';
  if (!ac) return;
  sfxBus.gain.value = save.settings.sound ? 1 : 0;
  musicBus.gain.setTargetAtTime(save.settings.music ? 0.45 : 0, ac.currentTime, 0.4);
  const id = currentTrack();
  if (!save.settings.music) { stopMusic(); playFile(null); }
  else if (id === 'theme') { playFile(null); startMusic(); }
  else if (external.some(c => c.id === id)) { stopMusic(); playFile(null); }
  else { stopMusic(); playFile(id); }
}

export function suspendAudio(hidden) {
  if (!ac) return;
  if (hidden) { ac.suspend(); file?.el.pause(); }
  else { ac.resume(); file?.el.play().catch(() => {}); }
}

// ---------- music tracks: the built-in theme, plus files listed in public/music/tracks.json ----------
let tracks = [], file = null; // file: { id, el, gain } for the track that's playing
const FILE_VOL = 0.55;        // on top of the music bus; downloaded tracks are mastered far louder than the theme

export async function loadTracks() {
  try {
    const res = await fetch('./music/tracks.json', { cache: 'no-cache' });
    const list = res.ok ? await res.json() : [];
    tracks = list.filter(t => t && typeof t.file === 'string' && t.title);
  } catch { tracks = []; } // offline, or the single-file build: the theme still plays
  return tracks;
}
// Sources played outside WebAudio (YouTube); while one is chosen, the game's own music stays quiet.
let external = [];
export function setExternalChoices(list) { external = list; }
export const musicChoices = () => [
  { id: 'off', name: 'Off (play your own)' },
  { id: 'theme', name: 'Holeshot theme' },
  ...tracks.map(t => ({ id: t.file, name: t.artist ? `${t.title} · ${t.artist}` : t.title })),
  ...external,
];
const currentTrack = () => {
  const id = save.settings.track;
  return tracks.some(t => t.file === id) || external.some(c => c.id === id) ? id : 'theme';
};
export const musicChoice = () => (save.settings.music ? currentTrack() : 'off');

function playFile(id) {
  if (file?.id === id) return;
  const t = ac.currentTime;
  if (file) { // fade out, then let the element go
    const old = file;
    old.gain.gain.setTargetAtTime(0, t, 0.25);
    setTimeout(() => { old.el.pause(); old.el.removeAttribute('src'); old.el.load(); old.gain.disconnect(); }, 1200);
    file = null;
  }
  if (!id) return;
  const el = new Audio(`./music/${encodeURIComponent(id)}`), gain = ac.createGain();
  el.loop = true; el.preload = 'auto';
  ac.createMediaElementSource(el).connect(gain); gain.connect(musicBus);
  gain.gain.setValueAtTime(0, t); gain.gain.setTargetAtTime(FILE_VOL, t + 0.15, 0.35);
  el.play().catch(() => {}); // blocked until the first tap; initAudio runs applyAudio again then
  file = { id, el, gain };
}

function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0, bus = sfxBus) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.03);
}

let noiseBuf = null;
function noise(dur, vol, freq, q = 1, delay = 0, type = 'bandpass', bus = sfxBus) {
  if (!ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + delay, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}

export const sfx = {
  hit: p => { tone(520, 0.09, 'triangle', 0.22, 180); tone(150, 0.14, 'sine', 0.12 + 0.2 * p, 60); noise(0.05, 0.15, 2500, 1.2); },
  bounce: v => {
    const now = performance.now(); if (now - lastBounce < 45) return; lastBounce = now;
    tone(760 + Math.random() * 220, 0.06, 'triangle', Math.min(0.16, 0.02 + v * 0.014));
  },
  bumper: () => { tone(220, 0.18, 'square', 0.08, 660); tone(880, 0.12, 'triangle', 0.1, 1320); },
  coin: () => { tone(988, 0.08, 'square', 0.06); tone(1319, 0.22, 'square', 0.06, null, 0.07); },
  key: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, null, i * 0.05)); },
  unlock: () => { tone(392, 0.3, 'triangle', 0.15, 784); [523, 659, 784].forEach((f, i) => tone(f, 0.3, 'sine', 0.12, null, 0.15 + i * 0.07)); noise(0.3, 0.1, 4000, 0.7, 0.1); },
  portal: () => { tone(300, 0.35, 'sine', 0.18, 1200); tone(1200, 0.35, 'sine', 0.08, 300, 0.05); },
  boost: () => { noise(0.3, 0.2, 1200, 0.6); tone(200, 0.25, 'sawtooth', 0.06, 700); },
  splash: type => {
    if (type === 'lava') { noise(0.5, 0.3, 600, 0.6, 0, 'lowpass'); tone(160, 0.4, 'sawtooth', 0.08, 60); }
    else { noise(0.45, 0.35, 900, 0.5); tone(500, 0.2, 'sine', 0.12, 120); }
  },
  hole: () => { tone(300, 0.28, 'sine', 0.32, 90); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.13, null, 0.14 + i * 0.08)); },
  miss: () => { tone(330, 0.18, 'sine', 0.1, 220); tone(247, 0.26, 'sine', 0.1, 160, 0.14); },
  ooh: () => { tone(420, 0.45, 'sine', 0.12, 300); tone(425, 0.45, 'triangle', 0.05, 305); },
  star: i => { tone([784, 988, 1319][i] || 1319, 0.3, 'triangle', 0.16); tone(([784, 988, 1319][i] || 1319) * 2, 0.2, 'sine', 0.05, null, 0.02); },
  combo: n => { for (let i = 0; i < Math.min(n, 5); i++) tone(660 * Math.pow(1.122, i), 0.12, 'square', 0.05, null, 0.4 + i * 0.06); },
  click: () => tone(1100, 0.04, 'triangle', 0.07),
  buy: () => { [659, 880, 1319].forEach((f, i) => tone(f, 0.18, 'square', 0.06, null, i * 0.06)); },
  nope: () => { tone(200, 0.15, 'square', 0.06); tone(150, 0.2, 'square', 0.06, null, 0.1); },
};

// ---------- music: a gentle four-chord loop with pad, bass, arpeggio and shaker ----------
const BPM = 92, STEP = 60 / BPM / 2;
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]]; // Am7 Fmaj7 Cmaj7 G7
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
let musicTimer = null, nextTime = 0, stepN = 0;

function startMusic() {
  if (musicTimer || !ac) return;
  nextTime = ac.currentTime + 0.1;
  musicTimer = setInterval(schedule, 60);
}
function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

function schedule() {
  if (!ac || ac.state !== 'running') return;
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + 0.3) { playStep(stepN, nextTime); nextTime += STEP; stepN++; }
}

function playStep(s, t) {
  const chord = CHORDS[Math.floor(s / 8) % 4], pos = s % 8, d = t - ac.currentTime;
  if (pos === 0) {
    for (const n of chord) pad(midi(n), t, STEP * 8);
  }
  if (pos === 0 || pos === 5) tone(midi(chord[0] - 12), STEP * 2.5, 'sine', 0.16, null, d, musicBus);
  if ((s * 7) % 11 !== 3) tone(midi(chord[ARP[pos]] + 12), 0.28, 'triangle', 0.05, null, d, musicBus);
  if (pos % 2 === 1) noise(0.04, 0.035, 7000, 0.8, d, 'highpass', musicBus);
}

function pad(freq, t, dur) {
  const f = ac.createBiquadFilter(), g = ac.createGain();
  f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.035, t + 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  f.connect(g); g.connect(musicBus);
  for (const det of [-6, 6]) {
    const o = ac.createOscillator();
    o.type = 'triangle'; o.frequency.value = freq; o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + dur + 0.05);
  }
}
