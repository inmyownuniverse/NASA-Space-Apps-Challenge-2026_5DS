// Owner: Hazel · Support: Freia
// Eyes-closed mode: hide the picture and speak a short summary of the data every few seconds,
// so the music can be followed with no screen at all.

import { setDataAnnouncements } from './a11y.js';
import { tuned } from './sound/tuning.js';
import { duckMusic } from './sound/engine.js';

const SUMMARY_MS = 8000; // one spoken summary every 8 seconds
const POLL_MS = 250;     // read the latest frame this often (to count lightning flashes)

let timer = null, poll = null;
let run = 0;              // bumped when the mode is turned off, to stop the summary loop
let prev = null;          // previous summary values, for "rising" / "falling"
let flashes = [];         // flashes seen since the last summary

const round = (v) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
const unitWords = (unit) => (unit === '°C' ? 'degrees' : unit === 'nW/cm²/sr' ? 'nanowatts' : unit ?? '');

function trend(now, before, step) {
  if (before === null || before === undefined || now === null) return '';
  if (now > before + step) return ', rising';
  if (now < before - step) return ', falling';
  return ', steady';
}

/** Readable layer name: the legend label from the config if there is one ("Black Carbon"). */
function layerName(key, cfg) {
  return (cfg.extract?.classes?.[key]?.label ?? key.replace(/_/g, ' ')).toLowerCase();
}

function side(xs, gw) {
  if (!xs.length) return '';
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return avg < gw / 3 ? ', mostly in the west' : avg >= (2 * gw) / 3 ? ', mostly in the east' : ', mostly in the middle';
}

/** One plain sentence about the current data, by kind of dataset. */
export function summarize(f, cfg) {
  if (!f) return '';
  const kind = cfg.sound?.mapper;
  const unit = unitWords(cfg.colorbar?.unit);
  const sample = f.fake ? ' Sample data.' : '';
  let text = '';

  if (f.mean === null && (f.grid ?? []).every((v) => v === null)) {
    // Night Lights' change-map sections are left silent on purpose.
    text = 'This part of the video is silent on purpose.';
  } else if (kind === 'events') {
    // Flashes counted since the last summary; the very first summary uses the screen right now
    // (strikes still visible on screen, from the strike-count grid).
    const counted = flashes.length;
    const onScreen = (f.grid ?? []).reduce((a, v) => a + (v ?? 0), 0);
    const n = counted || onScreen;
    // Analyser flashes carry a grid cell; sample flashes carry x in grid columns.
    const cols = flashes.map((x) => (Number.isInteger(x.cell) ? x.cell % cfg.grid.w : x.x));
    text = !n ? 'No lightning right now.'
      : !counted ? `${n} lightning strike${n === 1 ? '' : 's'} on screen.`
      : `${n} flash${n === 1 ? '' : 'es'}${side(cols, cfg.grid.w).replace('in the west', 'on the left').replace('in the east', 'on the right')}.`;
  } else if (kind === 'density') {
    const vals = (f.grid ?? []).filter((v) => v !== null);
    const lit = tuned(cfg).sound.litAbove ?? 5;
    const pct = vals.length ? Math.round((100 * vals.filter((v) => v > lit).length) / vals.length) : null;
    text = pct === null ? 'No light data right now.' : `${pct} percent lit${trend(pct, prev?.pct, 1)}.`;
    prev = { pct };
  } else if (kind === 'layers') {
    const entries = Object.entries(f.layers ?? {}).sort((a, b) => b[1] - a[1]);
    text = entries.length
      ? `Strongest is ${layerName(entries[0][0], cfg)}${entries.length > 1 ? `, then ${layerName(entries[1][0], cfg)}` : ''}.`
      : 'Particle types are not measured yet.';
  } else if (f.mean !== null && f.mean !== undefined) {
    // Kept short so it fits easily between summaries.
    const label = kind === 'continuousField' && cfg.id === 'sst' ? 'Currents' : 'Average';
    text = `${label} ${round(f.mean)} ${unit}${trend(f.mean, prev?.mean, 0.3)}.`;
    const hot = tuned(cfg).sound.tensionAbove;
    if (hot !== undefined && f.max > hot && !f.fake) text += ` Hottest ${round(f.max)}.`;
    prev = { mean: f.mean };
  } else {
    text = 'No data in this frame.';
  }
  return text + sample;
}

// ---------- speech: reliable, English, and the music dips while it talks ----------

let voice = null;
let current = null;   // the utterance being spoken (kept so the browser doesn't drop its events)
let restoreTimer = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice = voices.find((v) => /^en[-_](GB|US)/i.test(v.lang) && v.localService)
    ?? voices.find((v) => /^en/i.test(v.lang))
    ?? null;
}

/** Resolves once the browser has loaded its voices (or after 1.5 s, whichever is first). */
function voicesReady() {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  if (speechSynthesis.getVoices().length) { pickVoice(); return Promise.resolve(); }
  return new Promise((resolve) => {
    const done = () => { pickVoice(); resolve(); };
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

function unduck() {
  clearTimeout(restoreTimer);
  duckMusic(false);
}

/**
 * Speak one line. queue = true waits behind what is being said; otherwise a line still being
 * spoken is cut off, because a newer summary is due.
 * @returns {Promise<void>} resolves when the line has been spoken (or failed, or 15 s passed)
 */
async function say(text, { queue = false } = {}) {
  if (!('speechSynthesis' in window) || !text) return;
  await voicesReady();
  if (!queue && (speechSynthesis.speaking || speechSynthesis.pending)) {
    speechSynthesis.cancel();
    await new Promise((r) => setTimeout(r, 60)); // Chrome can drop a line spoken right after cancel
  }
  speechSynthesis.resume(); // Chrome sometimes leaves speech paused
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  u.rate = 1.1;
  u.onstart = () => { clearTimeout(restoreTimer); duckMusic(true); };
  const finished = new Promise((resolve) => {
    u.onend = u.onerror = () => {
      if (current === u) current = null;
      if (!speechSynthesis.speaking && !speechSynthesis.pending) unduck();
      resolve();
    };
    setTimeout(resolve, 15000);
  });
  current = u;
  speechSynthesis.speak(u);
  restoreTimer = setTimeout(unduck, 15000); // never leave the music dipped
  return finished;
}

/**
 * Turn eyes-closed mode on or off.
 * @param {boolean} on
 * @param {{ getFeatures: () => object|null, getCfg: () => object|null, isPlaying: () => boolean }} src
 */
export function setEyesClosed(on, src) {
  document.body.classList.toggle('eyes-closed', on);
  run++;
  clearTimeout(timer);
  clearInterval(poll);
  timer = poll = null;
  prev = null;
  flashes = [];
  setDataAnnouncements(!on); // the spoken summaries replace the screen-reader data lines
  if (!on) {
    unduck();
    return;
  }

  // Speech is always on in this mode, whatever else is set: a short intro, a first summary
  // straight away, then a summary every 8 seconds (start to start). Each one is spoken to the end;
  // a line is only cut off if it is still going when the next one is due.
  const myRun = run;
  let lastStart = performance.now();
  const loop = () => {
    const wait = Math.max(300, SUMMARY_MS - (performance.now() - lastStart));
    timer = setTimeout(async () => {
      if (myRun !== run) return;
      const cfg = src.getCfg();
      lastStart = performance.now();
      if (cfg && src.isPlaying()) {
        await say(summarize(src.getFeatures(), cfg));
        flashes = [];
      }
      if (myRun === run) loop();
    }, wait);
  };
  (async () => {
    say('Eyes-closed mode on. Press E to turn it off.');
    const cfg0 = src.getCfg();
    const f0 = src.getFeatures();
    lastStart = performance.now();
    await say(cfg0 && f0 ? summarize(f0, cfg0) : 'Choose a dataset and press Space to play.', { queue: true });
    flashes = [];
    if (myRun === run) loop();
  })();

  let lastFrame = null;
  poll = setInterval(() => {
    const f = src.getFeatures();
    if (f && f !== lastFrame && f.flashes?.length) flashes.push(...f.flashes);
    lastFrame = f;
  }, POLL_MS);
}
