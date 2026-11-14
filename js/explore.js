// Owner: Jaden · Support: Hazel
// Explore mode: move a finger, mouse or arrow keys over the map and hear the value at that spot.
// The proof panel shows how the sound was worked out: the pixel colour, where that colour sits on
// the colour bar, the real value it stands for, and the note that was played.
// Colour matching for one spot lives in colormatch.js (a small patch, matched in CIELAB).
// Add ?debug=1 to the address to see exactly which video pixel was read.

import { readPatch, PATCH, SEARCH } from './colormatch.js';
import { playProbe, noteForValue } from './sound/engine.js';
import { tuned } from './sound/tuning.js';
import { valueRange } from './sound/scales.js';
import { demoFeatures } from './sound/demo.js';
import { announce, buzz } from './a11y.js';

const POINTER_GAP_MS = 120; // at most one probe per 120 ms while dragging
const ANNOUNCE_GAP_MS = 700;
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });

const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const spokenUnit = (unit) => (unit === '°C' ? 'degrees Celsius' : unit ?? '');

// What to say when there is no value, by reason (see colormatch.readPatch).
const MISS = {
  land: 'Land or no data here.',
  line: 'Current line, no data here.',
  outside: 'This colour is outside the colour bar range.',
  sample: 'The sample data has nothing at this spot.',
};

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

function cropOf(cfg, vw, vh) {
  return cfg.crop ?? { x: 0, y: 0, w: vw, h: vh };
}

/** Cell rectangle in video pixels. */
function cellRect(cfg, col, row, vw, vh) {
  const crop = cropOf(cfg, vw, vh);
  const w = crop.w / cfg.grid.w;
  const h = crop.h / cfg.grid.h;
  return { x: crop.x + col * w, y: crop.y + row * h, w, h };
}

/**
 * Read the spot (vx, vy), in source video pixels, from the frame on screen.
 * @returns {{ status: string, value: number|null, rgb: number[]|null, at: number[]|null,
 *            valid?: number, total?: number, dE?: number|null, distance?: number, sample: boolean }}
 */
function readSpot(video, cfg, vx, vy, col, row, t) {
  if (!video || video.readyState < 2 || !video.videoWidth) {
    const value = demoFeatures(cfg, t).grid[row * cfg.grid.w + col];
    return { status: value === null ? 'sample' : 'ok', value, rgb: null, at: null, sample: true };
  }
  // Copy a small square around the spot at full resolution (no scaling, so no blending).
  const r = SEARCH;
  const sx = Math.max(0, vx - r), sy = Math.max(0, vy - r);
  const sw = Math.min(video.videoWidth, vx + r + 1) - sx;
  const sh = Math.min(video.videoHeight, vy + r + 1) - sy;
  work.width = sw;
  work.height = sh;
  wctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  const px = wctx.getImageData(0, 0, sw, sh).data;
  const res = readPatch(px, sw, sh, vx - sx, vy - sy, cfg.colorbar.stops);
  return { ...res, at: [res.at[0] + sx, res.at[1] + sy], sample: false };
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
    <p class="probe-how"></p>
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
  const { col, row, spot, note, hot } = info;
  const gw = cfg.grid.w, gh = cfg.grid.h;
  const unit = cfg.colorbar.unit ?? '';
  const [min, max] = valueRange(cfg);
  const q = (sel) => panel.querySelector(sel);
  const { value, rgb, status, sample } = spot;

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
    q('.probe-value').textContent = MISS[status] ?? MISS.land;
    q('.probe-how').textContent = sample ? '' : `None of the ${spot.total} pixels around this spot matched the colour bar.`;
    q('.probe-note').textContent = 'Note played: none';
    return;
  }
  marker.hidden = false;
  marker.style.left = `${((value - min) / (max - min || 1)) * 100}%`;
  const pos = Math.round(((value - min) / (max - min || 1)) * 100);
  const lead = status === 'nearest' ? `Nearest ocean value, ${spot.distance} pixels away: ` : 'Colour bar match: ';
  q('.probe-value').textContent = `${lead}${pos}% along the bar, which means ${fmt(value)} ${unit}.${hot ? ' Hotspot.' : ''}`;
  q('.probe-how').textContent = sample ? ''
    : status === 'nearest'
      ? `Too few coloured pixels right here (white current lines, land or background), so the closest matching pixel was used.`
      : `Middle value of the ${spot.valid} of ${spot.total} pixels around this spot that match the colour bar (white lines, land and background are skipped).`;
  q('.probe-note').textContent = `Note played: ${note ?? 'none'}`;
}

// ---------- explore mode ----------

/**
 * Turn on Explore mode for the overlay canvas.
 * Pointer: move or tap over the map (reads the exact spot). Keyboard: focus the map, then arrow
 * keys move one cell (reads the cell centre), Home / End jump to the west / east edge,
 * Enter plays the current spot again.
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

  const vsize = () => [video.videoWidth || canvas.width, video.videoHeight || canvas.height];
  let col = Math.floor(gw / 2), row = Math.floor(gh / 2);
  let point = null;      // exact spot in video pixels from the pointer; null = cell centre
  let lastSpot = null;   // last reading, for the debug marker
  let lastPointer = 0, lastAnnounce = 0;

  function spotPixel() {
    if (point) return point;
    const [vw, vh] = vsize();
    const r = cellRect(cfg, col, row, vw, vh);
    return [Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)];
  }

  function drawCursor() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const [vw, vh] = vsize();
    const r = cellRect(cfg, col, row, vw, vh);
    const { s, ox, oy } = fit(canvas, vw, vh);
    const x = ox + r.x * s, y = oy + r.y * s, w = r.w * s, h = r.h * s;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd23f';
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);

    if (!DEBUG) return;
    // Debug: the spot read (magenta cross), the 7 × 7 patch (magenta box) and the pixel whose
    // colour is shown in the panel (cyan dot). All drawn from source-video pixel coordinates.
    const [px, py] = spotPixel();
    const cx = ox + (px + 0.5) * s, cy = oy + (py + 0.5) * s;
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12);
    ctx.stroke();
    const half = Math.floor(PATCH / 2);
    ctx.strokeRect(ox + (px - half) * s, oy + (py - half) * s, PATCH * s, PATCH * s);
    if (lastSpot?.at) {
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(ox + (lastSpot.at[0] + 0.5) * s, oy + (lastSpot.at[1] + 0.5) * s, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function probe(forceAnnounce) {
    const t = video.currentTime || performance.now() / 1000;
    const [vx, vy] = spotPixel();
    const spot = readSpot(video, cfg, vx, vy, col, row, t);
    lastSpot = spot;
    const value = spot.value;
    const hot = value !== null && value > hotAbove;
    const note = value !== null ? playProbe(cfg, value, col) ?? noteForValue(cfg, value) : null;
    if (hot) buzz(30);
    drawCursor();
    updatePanel(panel, cfg, { col, row, spot, note, hot });
    if (DEBUG) console.debug('explore', { vx, vy, ...spot });

    const now = performance.now();
    if (!forceAnnounce && now - lastAnnounce < ANNOUNCE_GAP_MS) return;
    lastAnnounce = now;
    const where = `Row ${row + 1}, column ${col + 1}, ${direction(col, row, gw, gh)}.`;
    const what = value === null
      ? MISS[spot.status] ?? MISS.land
      : `${spot.status === 'nearest' ? 'Nearest ocean value, ' : ''}${fmt(value)} ${spokenUnit(cfg.colorbar.unit)}${note ? `, note ${note}` : ''}.${hot ? ' Hotspot.' : ''}${spot.sample ? ' Sample data.' : ''}`;
    announce(`${where} ${what}`);
  }

  /** Pointer position to source video pixel and grid cell (null outside the map area). */
  function fromPointer(e) {
    const rect = canvas.getBoundingClientRect(); // CSS pixels, so devicePixelRatio doesn't matter
    const [vw, vh] = vsize();
    const { s, ox, oy } = fit(canvas, vw, vh);
    const x = (((e.clientX - rect.left) / rect.width) * canvas.width - ox) / s;
    const y = (((e.clientY - rect.top) / rect.height) * canvas.height - oy) / s;
    const crop = cropOf(cfg, vw, vh);
    const c = Math.floor(((x - crop.x) / crop.w) * gw);
    const r = Math.floor(((y - crop.y) / crop.h) * gh);
    if (c < 0 || c >= gw || r < 0 || r >= gh) return null;
    return { cell: [c, r], px: [Math.floor(x), Math.floor(y)] };
  }

  function onPointer(e) {
    const hit = fromPointer(e);
    if (!hit) return;
    const now = performance.now();
    const moved = !point || hit.px[0] !== point[0] || hit.px[1] !== point[1];
    if (e.type === 'pointermove' && (!moved || now - lastPointer < POINTER_GAP_MS)) return;
    lastPointer = now;
    [col, row] = hit.cell;
    point = hit.px;
    probe(e.type === 'pointerdown');
  }

  function onKey(e) {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      col = Math.min(gw - 1, Math.max(0, col + moves[e.key][0]));
      row = Math.min(gh - 1, Math.max(0, row + moves[e.key][1]));
      point = null;
    } else if (e.key === 'Home') { col = 0; point = null; }
    else if (e.key === 'End') { col = gw - 1; point = null; }
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

/** For tests: read one spot of the current frame (source video pixels). */
export function readSpotForTest(video, cfg, vx, vy) {
  return readSpot(video, cfg, vx, vy, 0, 0, 0);
}
