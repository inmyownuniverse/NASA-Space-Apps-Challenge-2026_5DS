// Owner: Hazel · Support: Freia
// Eyes-closed mode: hide the picture and speak a short summary of the data every few seconds,
// so the music can be followed with no screen at all.

import { speak, setDataAnnouncements } from './a11y.js';
import { tuned } from './sound/tuning.js';

const SUMMARY_MS = 8000; // one spoken summary every 8 seconds
const POLL_MS = 250;     // read the latest frame this often (to count lightning flashes)

let timer = null, poll = null;
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

  if (kind === 'events') {
    const n = flashes.length;
    text = n ? `${n} lightning flash${n === 1 ? '' : 'es'} in the last few seconds${side(flashes.map((x) => x.x), cfg.grid.w)}.` : 'No lightning right now.';
  } else if (kind === 'density') {
    const vals = (f.grid ?? []).filter((v) => v !== null);
    const lit = tuned(cfg).sound.litAbove ?? 5;
    const pct = vals.length ? Math.round((100 * vals.filter((v) => v > lit).length) / vals.length) : null;
    text = pct === null ? 'No light data right now.' : `About ${pct} percent of the map is lit${trend(pct, prev?.pct, 1)}.`;
    prev = { pct };
  } else if (kind === 'layers') {
    const entries = Object.entries(f.layers ?? {}).sort((a, b) => b[1] - a[1]);
    text = entries.length
      ? `Strongest is ${entries[0][0]}${entries.length > 1 ? `, then ${entries[1][0]}` : ''}.`
      : 'Particle types are not measured yet.';
  } else if (f.mean !== null && f.mean !== undefined) {
    const label = kind === 'continuousField' && cfg.id === 'sst' ? 'Visible currents average' : 'Average';
    text = `${label} ${round(f.mean)} ${unit}${trend(f.mean, prev?.mean, 0.3)}.`;
    const hot = tuned(cfg).sound.tensionAbove;
    if (hot !== undefined && f.max > hot && !f.fake) text += ` Warmest spots ${round(f.max)} ${unit}, above the ${hot} degree danger line.`;
    prev = { mean: f.mean };
  } else {
    text = 'No data in this frame.';
  }
  return text + sample;
}

/**
 * Turn eyes-closed mode on or off.
 * @param {boolean} on
 * @param {{ getFeatures: () => object|null, getCfg: () => object|null, isPlaying: () => boolean }} src
 */
export function setEyesClosed(on, src) {
  document.body.classList.toggle('eyes-closed', on);
  clearInterval(timer);
  clearInterval(poll);
  timer = poll = null;
  prev = null;
  flashes = [];
  setDataAnnouncements(!on); // the spoken summaries replace the screen-reader data lines
  if (!on) return;

  let lastFrame = null;
  poll = setInterval(() => {
    const f = src.getFeatures();
    if (f && f !== lastFrame && f.flashes?.length) flashes.push(...f.flashes);
    lastFrame = f;
  }, POLL_MS);
  timer = setInterval(() => {
    const cfg = src.getCfg();
    if (!cfg || !src.isPlaying()) return;
    speak(summarize(src.getFeatures(), cfg));
    flashes = [];
  }, SUMMARY_MS);
}
