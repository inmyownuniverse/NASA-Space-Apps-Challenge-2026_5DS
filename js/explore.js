// Owner: Jaden · Support: Hazel
// Explore mode: move a finger, mouse or arrow keys over the map and hear the value at that spot.
// The proof panel shows how the sound was worked out: the pixel colour, where that colour sits on
// the colour bar, the real value it stands for, and the note that was played.

import { colorToValue } from './colorbar.js';
import { playProbe, noteForValue } from './sound/engine.js';
import { tuned } from './sound/tuning.js';
import { valueRange } from './sound/scales.js';
import { demoFeatures } from './sound/demo.js';
import { announce, buzz } from './a11y.js';

const SAMPLES = 5;          // 5 × 5 sample points per cell, like the analyser
const POINTER_GAP_MS = 120; // at most one probe per 120 ms while dragging
const ANNOUNCE_GAP_MS = 700;

const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });

const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const spokenUnit = (unit) => (unit === '°C' ? 'degrees Celsius' : unit ?? '');

function direction(col, row, gw, gh) {
  const ns = row < gh / 3 ? 'north' : row >= (2 * gh) / 3 ? 'south' : '';
  const ew = col < gw / 3 ? 'west' : col >= (2 * gw) / 3 ? 'east' : '';
  return [ns, ew].filter(Boolean).join(' ') || 'centre';
}

/**
 * Where the video sits on the overlay canvas. The video keeps its shape inside the 16:9 stage,
 * so a 2:1 video has black bars above and below: scale s and offsets ox, oy (canvas pixels).
 */
function fit(canvas, vw, vh) {
  const s = Math.min(canvas.width / vw, canvas.height / vh);
  return { s, ox: (canvas.width - vw * s) / 2, oy: (canvas.height - vh * s) / 2 };
}

/** Cell rectangle in video pixels. */
function cellRect(cfg, col, row, vw, vh) {
  const crop = cfg.crop ?? { x: 0, y: 0, w: vw, h: vh };
  const w = crop.w / cfg.grid.w;
  const h = crop.h / cfg.grid.h;
  return { x: crop.x + col * w, y: crop.y + row * h, w, h };
}

/**
 * Read one grid cell from the video frame on screen.
 * @returns {{ rgb: number[]|null, value: number|null, sample: boolean }}
 */
function readCell(video, cfg, col, row, t) {
  if (!video || video.readyState < 2 || !video.videoWidth) {
    const f = demoFeatures(cfg, t);
    return { rgb: null, value: f.grid[row * cfg.grid.w + col], sample: true };
  }
  const r = cellRect(cfg, col, row, video.videoWidth, video.videoHeight);
  const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
  work.width = w;
  work.height = h;
  wctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, w, h);
  const px = wctx.getImageData(0, 0, w, h).data;
  const stops = cfg.colorbar.stops;
  const maxDist = cfg.colorbar.maxDist ?? 60;
  const hits = [];
  let centre = null;
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const x = Math.floor((w * (sx + 0.5)) / SAMPLES);
      const y = Math.floor((h * (sy + 0.5)) / SAMPLES);
      const i = (y * w + x) * 4;
      const rgb = [px[i], px[i + 1], px[i + 2]];
      if (sx === 2 && sy === 2) centre = rgb;
      const v = colorToValue(rgb[0], rgb[1], rgb[2], stops, maxDist);
      if (v !== null) hits.push({ v, rgb });
    }
  }
  if (!hits.length) return { rgb: centre, value: null, sample: false };
  hits.sort((a, b) => a.v - b.v);
  const mid = hits[Math.floor(hits.length / 2)]; // median, like the analyser
  return { rgb: mid.rgb, value: mid.v, sample: false };
}

// ---------- proof panel ----------

function panelEl() {
  let el = document.getElementById('probe');
  if (el) return el;
  el = document.createElement('section');
  el.id = 'probe';
  el.className = 'probe';
  el.setAttribute('aria-labelledby', 'probe-heading');
  el.innerHTML = `
    <h3 id="probe-heading">Proof: what this spot means</h3>
    <p class="probe-where"></p>
    <div class="probe-row"><span class="probe-swatch" aria-hidden="true"></span><span class="probe-colour"></span></div>
    <div class="probe-bar" aria-hidden="true"><span class="probe-marker"></span></div>
    <p class="probe-bar-ends"><span class="probe-min"></span><span class="probe-max"></span></p>
    <p class="probe-value"></p>
    <p class="probe-note"></p>`;
  const readout = document.getElementById('readout');
  (readout?.parentElement ?? document.body).insertBefore(el, readout?.nextSibling ?? null);
  return el;
}

function gradientCss(cfg) {
  const stops = cfg.colorbar.stops;
  const [min, max] = valueRange(cfg);
  const span = max - min || 1;
  return `linear-gradient(to right, ${stops.map((s) => `rgb(${s.rgb.join(',')}) ${((s.value - min) / span) * 100}%`).join(', ')})`;
}

function updatePanel(panel, cfg, info) {
  const { col, row, rgb, value, note, hot, sample } = info;
  const gw = cfg.grid.w, gh = cfg.grid.h;
  const unit = cfg.colorbar.unit ?? '';
  const [min, max] = valueRange(cfg);
  const q = (sel) => panel.querySelector(sel);

  q('.probe-where').textContent = `Row ${row + 1} of ${gh}, column ${col + 1} of ${gw} (${direction(col, row, gw, gh)})`;
  q('.probe-swatch').style.background = rgb ? `rgb(${rgb.join(',')})` : 'transparent';
  q('.probe-colour').textContent = sample
    ? 'No video loaded, so this is sample data, not a real pixel.'
    : rgb ? `Pixel colour: rgb(${rgb.join(', ')})` : 'No pixel';
  q('.probe-bar').style.background = gradientCss(cfg);
  q('.probe-min').textContent = `${fmt(min)} ${unit}`;
  q('.probe-max').textContent = `${fmt(max)} ${unit}`;
  const marker = q('.probe-marker');
  if (value === null) {
    marker.hidden = true;
    q('.probe-value').textContent = 'This colour is not on the colour bar (land, labels or background), so there is no data here.';
    q('.probe-note').textContent = 'Note played: none';
  } else {
    marker.hidden = false;
    marker.style.left = `${((value - min) / (max - min || 1)) * 100}%`;
    const pos = Math.round(((value - min) / (max - min || 1)) * 100);
    q('.probe-value').textContent = `Colour bar match: ${pos}% along the bar, which means ${fmt(value)} ${unit}.${hot ? ' Hotspot.' : ''}`;
    q('.probe-note').textContent = `Note played: ${note ?? 'none'}`;
  }
}

// ---------- explore mode ----------

/**
 * Turn on Explore mode for the overlay canvas.
 * Pointer: move or tap over the map. Keyboard: focus the map, then arrow keys move one cell,
 * Home / End jump to the west / east edge, Enter plays the current cell again.
 *
 * @param {HTMLCanvasElement} canvas overlay canvas above the video
 * @param {object} cfg dataset config
 * @returns {() => void} call to turn Explore mode off (remove listeners)
 */
export function enableExplore(canvas, cfg) {
  const video = document.getElementById('video');
  const ctx = canvas.getContext('2d');
  const gw = cfg.grid.w, gh = cfg.grid.h;
  const s = tuned(cfg).sound;
  const [min, max] = valueRange(cfg);
  const hotAbove = s.tensionAbove ?? min + 0.9 * (max - min);
  const panel = panelEl();
  panel.hidden = false;

  const saved = { tabIndex: canvas.getAttribute('tabindex'), role: canvas.getAttribute('role'), label: canvas.getAttribute('aria-label') };
  canvas.style.touchAction = 'none';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', 'map explorer');
  canvas.setAttribute('aria-label', `Explore the ${cfg.title} map. Arrow keys move one cell, Home and End jump west and east, Enter plays the spot again.`);

  let col = Math.floor(gw / 2), row = Math.floor(gh / 2);
  let lastPointer = 0, lastAnnounce = 0;

  function drawCursor() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const vw = video.videoWidth || canvas.width, vh = video.videoHeight || canvas.height;
    const r = cellRect(cfg, col, row, vw, vh);
    const { s, ox, oy } = fit(canvas, vw, vh);
    const x = ox + r.x * s, y = oy + r.y * s, w = r.w * s, h = r.h * s;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd23f';
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }

  function probe(forceAnnounce) {
    const t = video.currentTime || performance.now() / 1000;
    const { rgb, value, sample } = readCell(video, cfg, col, row, t);
    const hot = value !== null && value > hotAbove;
    const note = value !== null ? playProbe(cfg, value, col) ?? noteForValue(cfg, value) : null;
    if (hot) buzz(30);
    drawCursor();
    updatePanel(panel, cfg, { col, row, rgb, value, note, hot, sample });

    const now = performance.now();
    if (!forceAnnounce && now - lastAnnounce < ANNOUNCE_GAP_MS) return;
    lastAnnounce = now;
    const where = `Row ${row + 1}, column ${col + 1}, ${direction(col, row, gw, gh)}.`;
    const what = value === null
      ? 'No data here.'
      : `${fmt(value)} ${spokenUnit(cfg.colorbar.unit)}${note ? `, note ${note}` : ''}.${hot ? ' Hotspot.' : ''}${sample ? ' Sample data.' : ''}`;
    announce(`${where} ${what}`);
  }

  function cellFromPointer(e) {
    const rect = canvas.getBoundingClientRect();
    const vw = video.videoWidth || canvas.width, vh = video.videoHeight || canvas.height;
    const { s, ox, oy } = fit(canvas, vw, vh);
    const x = (((e.clientX - rect.left) / rect.width) * canvas.width - ox) / s;
    const y = (((e.clientY - rect.top) / rect.height) * canvas.height - oy) / s;
    const crop = cfg.crop ?? { x: 0, y: 0, w: vw, h: vh };
    const c = Math.floor(((x - crop.x) / crop.w) * gw);
    const r = Math.floor(((y - crop.y) / crop.h) * gh);
    if (c < 0 || c >= gw || r < 0 || r >= gh) return null;
    return [c, r];
  }

  function onPointer(e) {
    const cell = cellFromPointer(e);
    if (!cell) return;
    const now = performance.now();
    const changed = cell[0] !== col || cell[1] !== row;
    if (e.type === 'pointermove' && (!changed || now - lastPointer < POINTER_GAP_MS)) return;
    lastPointer = now;
    [col, row] = cell;
    probe(e.type === 'pointerdown');
  }

  function onKey(e) {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      col = Math.min(gw - 1, Math.max(0, col + moves[e.key][0]));
      row = Math.min(gh - 1, Math.max(0, row + moves[e.key][1]));
    } else if (e.key === 'Home') col = 0;
    else if (e.key === 'End') col = gw - 1;
    else if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation(); // keep the arrows from scrubbing or changing the volume
    probe(true);
  }

  canvas.addEventListener('pointermove', onPointer);
  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('keydown', onKey);
  canvas.focus();
  drawCursor();
  // After the app's own "Explore mode" announcement, so this one isn't cut off.
  const hint = setTimeout(() => announce(canvas.getAttribute('aria-label')), 800);

  return () => {
    clearTimeout(hint);
    canvas.removeEventListener('pointermove', onPointer);
    canvas.removeEventListener('pointerdown', onPointer);
    canvas.removeEventListener('keydown', onKey);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    panel.hidden = true;
    canvas.removeAttribute('aria-roledescription');
    if (saved.tabIndex === null) canvas.removeAttribute('tabindex'); else canvas.setAttribute('tabindex', saved.tabIndex);
    if (saved.role) canvas.setAttribute('role', saved.role);
    if (saved.label) canvas.setAttribute('aria-label', saved.label);
  };
}
