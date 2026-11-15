// Owner: Aahana · Support: Celene
// Frame analysis: video frame → crop → grid → colorbar inversion → features.
//
// =============================================================================
// SST FEATURE SEMANTICS & SCIENTIFIC DOCUMENTATION:
// =============================================================================
// In the NASA SVS 3912 visualization ("Perpetual Ocean"), ocean surface currents
// are animated as dynamic streamlines color-coded by temperature over a dark
// ocean floor and neutral gray land masses.
//
// 1. grid:
//    Array(gw * gh) of 512 cells (32 × 16). Each non-null cell represents the
//    median calibrated temperature (°C, 0.0 to 32.0) of illuminated current
//    streamlines passing through that cell. Continents, letterboxes, unlit
//    ocean floor, and regions without active flow filaments return null.
//
// 2. mean:
//    The average temperature of currently detected, illuminated streamline
//    pixels across the globe. IMPORTANT: This is NOT an area-weighted global
//    ocean mean; it reflects only active, visible surface currents. Quiescent
//    water, cloudy/unlit areas, and land are excluded.
//
// 3. max:
//    The peak temperature observed among all illuminated current streamlines in
//    the current frame (typically in tropical or western boundary currents).
//
// 4. columns:
//    Array(gw) of 32 longitudinal slices (west → east). Each slice contains the
//    average temperature of active streamlines in that column, or null if no
//    streamlines are detected.
//
// 5. flashes:
//    Always [] for SST (lightning detection only).
//
// 6. change:
//    A normalized 0..1 metric tracking the fraction of grid cells whose sampled
//    streamline state noticeably shifted since the previous frame.
//    IMPORTANT: In this visualization, frame-to-frame change reflects the
//    VISUAL MOTION and advection of moving streamline filaments and their
//    lighting across grid boundaries, NOT a physical thermodynamic heating
//    or cooling trend of the ocean waters.
//
// 7. layers:
//    Always {} for SST (GEOS aerosols only).
// =============================================================================
// SHARED ADDITIVE CONFIGURATION (does not apply to SST, which has none of it):
// =============================================================================
// cfg.masks    — array of crop-relative annotation rectangles {x, y, w, h} in
//                source pixels. A cell whose sub-samples touch a mask is
//                reported as null: annotations burned into the frame are never
//                treated as data. SST has no masks.
//
// cfg.segments — array of {from, to, mode, masks?} in media seconds. Only times
//                inside a segment are analysed; outside every segment the
//                analyser returns empty features so no sound is produced. This
//                is how a visualization whose later half uses a DIFFERENT
//                colour encoding stays silent instead of being misread.
//                Segment masks are added to cfg.masks.
//
// cfg.extract  — per-dataset extraction settings, consumed only by the
//                extractor named in cfg.extract.mode. A config without
//                cfg.extract uses the original SST colourbar-inversion path.
// =============================================================================
// NIGHT LIGHTS SEMANTICS (mode: "brightness"):
// =============================================================================
// 1. grid: Array(gw * gh) of relative VISUAL brightness, 0..100, unitless.
//    Each cell is the 90th percentile luminance of its 5×5 representative
//    sub-samples that pass a calibrated dark threshold (measured on this
//    render: background ≈ 1, land ≈ 30–35, threshold 50). Values are NOT
//    radiance and NOT nW/cm²/sr; no physical unit is implied.
//    A completely dark cell returns 0 — darkness is a real measurement here.
//    A cell covered by an annotation mask returns null — that is missing data.
// 2. mean: average brightness over all unmasked cells, INCLUDING dark zeros.
// 3. max: brightest unmasked cell.
// 4. columns: Array(gw) west → east column averages (zeros included).
//    The SVS 5313 EIC master is a 7680×2160 panorama that tiles the SAME world
//    map twice for the two hyperwall screens (measured: an exact copy offset by
//    3842 px at 8K / 961 px in the proxy, copy-to-copy MAE 0.86 grey levels on
//    an annotation-free frame). The proxy crop therefore takes exactly ONE copy
//    (x 0–959 of 1920), which spans the full 360° of longitude, so a column IS a
//    longitude band (11.25° per column) rather than a screen band.
//    The render draws 360°×180° into 960×520 px, so its pixels are anisotropically
//    stretched; cells are 11.25°×11.25° but 30×32.5 px.
// 5. flashes: always [].
// 6. change: fraction of unmasked cells whose brightness moved more than
//    cfg.extract.changeThreshold points, or appeared/disappeared.
// 7. layers: always {}.
// Only the two annual segments are analysed; the diverging change map in
// between uses a different colour meaning and is deliberately left silent.
// Measured segment boundaries (frame-exact at 30 fps): annual 0.000–9.400 s,
// change map 9.433–21.233 s, annual + pop-outs 21.267–36.567 s, change map
// 36.600–43.300 s. Times between segments return empty features (silence).
// =============================================================================

import { colorToValue } from './colorbar.js';

const work = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const ctx = work ? work.getContext('2d', { willReadFrequently: true }) : null;
let history = new WeakMap();
const SAMPLES = 5;

/**
 * Safe empty features returned when video is unready, missing, or processing fails.
 * Guarantees that no synthetic or random data is emitted during production playback.
 *
 * @param {object} cfg dataset config
 * @returns {object} empty feature contract with null values
 */
export function emptyFeatures(cfg) {
  const gw = cfg?.grid?.w ?? 32;
  const gh = cfg?.grid?.h ?? 16;
  return {
    grid: new Array(gw * gh).fill(null),
    mean: null,
    max: null,
    columns: new Array(gw).fill(null),
    flashes: [],
    change: 0,
    layers: {},
  };
}

/**
 * Synthetic features with gentle drift, available ONLY through an explicit
 * development/test option (e.g. analyze(video, cfg, { fake: true })).
 * Never used as a silent fallback during production playback.
 *
 * @param {object} cfg dataset config
 * @returns {object} synthetic features
 */
export function fakeFeatures(cfg) {
  const gw = cfg?.grid?.w ?? 32;
  const gh = cfg?.grid?.h ?? 16;
  const wobble = Math.sin(performance.now() / 2000) * 5;
  return {
    grid: new Array(gw * gh).fill(null),
    mean: 15 + wobble,
    max: 30,
    columns: new Array(gw).fill(15 + wobble),
    flashes: [],
    change: 0.1,
    layers: {},
    fake: true,
  };
}

/**
 * Find the active segment for a media time.
 * @returns {{segment: object|null|undefined, index: number, key: string}}
 *   segment === undefined → the dataset declares no segments (ungated)
 *   segment === null      → outside every segment (must stay silent)
 */
function resolveSegment(cfg, t) {
  const segs = cfg?.segments;
  if (!Array.isArray(segs) || segs.length === 0) {
    return { segment: undefined, index: -1, key: 'ungated' };
  }
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    return { segment: null, index: -1, key: 'inactive' };
  }
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (t >= (s.from ?? 0) && t < (s.to ?? Infinity)) {
      return { segment: s, index: i, key: `${i}:${s.mode ?? ''}` };
    }
  }
  return { segment: null, index: -1, key: 'inactive' };
}

/** True when a crop-relative point lies inside any mask rectangle. */
function inMask(x, y, masks) {
  for (let i = 0; i < masks.length; i++) {
    const m = masks[i];
    if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return true;
  }
  return false;
}

/** Linear-interpolated percentile of an ascending numeric array, p in 0..1. */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Rec. 709 luma of an sRGB pixel, 0..255. */
function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Fraction of cells whose value changed noticeably since the previous frame.
 * Null ↔ number transitions count as change. Used by the non-SST extractors.
 */
function changeFraction(grid, prev, threshold) {
  let changed = 0;
  for (let i = 0; i < grid.length; i++) {
    const curr = grid[i];
    const before = prev[i];
    if (curr !== null && before !== null) {
      if (Math.abs(curr - before) > threshold) changed++;
    } else if ((curr === null) !== (before === null)) {
      changed++;
    }
  }
  return changed / grid.length;
}

/**
 * Night Lights / luminance extractor.
 *
 * Reports relative visual brightness 0..100 instead of an inverted colourbar
 * value. Dark cells are 0 (a real measurement); masked cells are null.
 *
 * @returns {{grid: (number|null)[], mean: number|null, max: number|null,
 *            columns: (number|null)[], change: number}}
 */
function extractBrightness(px, cropW, cropH, gw, gh, cfg, masks, state) {
  const darkThreshold = cfg?.extract?.darkThreshold ?? 50;
  const changeThreshold = cfg?.extract?.changeThreshold ?? 5;

  const grid = new Array(gw * gh).fill(null);
  const colSum = new Array(gw).fill(0);
  const colCount = new Array(gw).fill(0);
  let sum = 0;
  let count = 0;
  let max = 0;

  for (let r = 0; r < gh; r++) {
    const y0 = r * cropH / gh;
    const y1 = (r + 1) * cropH / gh;

    for (let c = 0; c < gw; c++) {
      const x0 = c * cropW / gw;
      const x1 = (c + 1) * cropW / gw;
      const lit = [];
      let masked = false;

      for (let sy = 0; sy < SAMPLES; sy++) {
        const py = Math.floor(y0 + (y1 - y0) * (sy + 0.5) / SAMPLES);
        const rowOffset = py * cropW * 4;

        for (let sx = 0; sx < SAMPLES; sx++) {
          const pxCoord = Math.floor(x0 + (x1 - x0) * (sx + 0.5) / SAMPLES);

          // Annotations burned into the frame are never data.
          if (masks.length && inMask(pxCoord, py, masks)) {
            masked = true;
            continue;
          }

          const idx = rowOffset + pxCoord * 4;
          const l = luma(px[idx], px[idx + 1], px[idx + 2]);
          if (l >= darkThreshold) lit.push(l);
        }
      }

      if (masked) continue; // null: annotation covers part of this cell

      const cellIndex = r * gw + c;
      let value = 0;
      if (lit.length > 0) {
        lit.sort((a, b) => a - b);
        value = Math.round((percentile(lit, 0.9) / 255) * 100 * 100) / 100;
      }

      grid[cellIndex] = value;
      sum += value;
      count++;
      if (value > max) max = value;
      colSum[c] += value;
      colCount[c]++;
    }
  }

  if (count === 0) return null;

  let change = 0;
  if (state.grid && state.grid.length === grid.length) {
    change = changeFraction(grid, state.grid, changeThreshold);
  }
  state.grid = grid;

  return {
    grid,
    mean: sum / count,
    max,
    columns: colSum.map((s, i) => (colCount[i] ? s / colCount[i] : null)),
    change,
  };
}

// =============================================================================
// LIGHTNING SEMANTICS (mode: "flashes")
// =============================================================================
// The ISS LIS visualization draws each strike as a small saturated-yellow blob
// with a hotter (near-white) centre, over a dark globe that moves, zooms and is
// sometimes cropped by the frame edge. There is NO intensity colourbar.
//
// 1. grid: Array(gw*gh) of STRIKE COUNTS — how many strike blobs have their
//    centroid in that cell. 0 is a real measurement (no strike in view); null
//    means the cell is covered by an annotation mask (no data). This is a
//    SCREEN-SPACE density map: the globe moves and zooms, so a grid column is
//    NOT a fixed longitude.
// 2. mean: mean strike count per unmasked cell. max: busiest unmasked cell.
// 3. columns: Array(gw) strike counts per screen column (screen-space flash
//    density, left→right on screen only — never geography).
// 4. flashes: ONLY events that appeared since the previous analysed frame
//    (the 10-day roving window keeps older strikes on screen, so reporting all
//    visible blobs would retrigger them every frame). Each event is
//    {x, y, nx, ny, intensity, cell}:
//      x, y      — source-screen pixel centroid inside the crop.
//      nx, ny    — 0..1 image coordinates. Globe-relative (0,0 = top-left of the
//                  detected globe disc's bounding square) when the disc is fully
//                  inside the frame; otherwise relative to the crop rect. The
//                  per-frame `flashSpace` field says which; limb strikes may fall
//                  slightly outside 0..1 (down to about -0.2 / 1.2). NEVER
//                  latitude or longitude: screen position says nothing about
//                  where on Earth a strike happened.
//      intensity — relative VISUAL brightness 0..100 of the event's hot core
//                  (mean luma of core pixels / 255). NOT physical lightning
//                  energy and NOT a radiometric quantity.
//      cell      — index r*gw + c of the 32×16 cell containing the centroid.
// 5. change: fraction of cells whose strike count differs from the previous frame.
//    `flashRejected` counts blobs dropped because they sat outside the globe disc.
// 6. layers: always {}.
//
// Flash pixels are found at SOURCE RESOLUTION (no grid downsampling first):
//   core  — r,g at sensor-blown brightness (default 240): the hot centre
//   halo  — saturated yellow (r-b >= 70, b <= 145): the glow around it
// A blob is a strike only if it contains BOTH a core and enough halo pixels, so
// stars, the white ISS ground-track line and its "ISS" label (bright, no yellow)
// are rejected. Blobs are grouped with 8-connected components; already-lit pixels
// from the previous frame (plus a small radius for globe motion) are subtracted so
// only new flashes are reported.

const createFlashState = () => ({
  lit: null,
  width: 0,
  height: 0,
  globe: null,
  events: [],
  counts: null,
  time: null,
});

// Scratch buffers are reused across frames: allocating three 921 600-byte arrays
// per call costs more than the detection itself (measured in Chromium).
const flashScratch = { w: 0, h: 0, core: null, lit: null, visited: null, stack: null };

function flashBuffers(w, h) {
  if (flashScratch.w !== w || flashScratch.h !== h) {
    flashScratch.w = w;
    flashScratch.h = h;
    flashScratch.core = new Uint8Array(w * h);
    flashScratch.lit = new Uint8Array(w * h);
    flashScratch.visited = new Uint8Array(w * h);
    flashScratch.stack = new Int32Array(w * h);
  } else {
    flashScratch.core.fill(0);
    flashScratch.lit.fill(0);
    flashScratch.visited.fill(0);
  }
  return flashScratch;
}



const GLOBE_STEP = 4;        // sample every 4th pixel when tracing the limb
const GLOBE_LUMA = 6;        // the day-side limb sits at 6–12; space/compression noise stays below 4
const GLOBE_MIN_RUN = 10;    // samples (× 4 px) of uninterrupted disc before a row counts
const GLOBE_PAD = 1.03;      // strikes bloom a few pixels past the silhouette

/**
 * Estimate the globe silhouette as a CIRCLE fitted to the day-side limb.
 *
 * A luminance-threshold centroid only finds the lit crescent: on a frame where
 * the night half is black (t≈90 s) that gives c≈(571,380) r≈267 instead of the
 * real disc c≈(640,362) r≈316, which pushes genuine limb strikes past nx = 1.
 * The lit limb, however, lies ON the true circle, so fitting the leftmost lit
 * pixel of each row recovers the whole disc (validated against the frame: the
 * fitted circle matches the visible edge at 30/90/180/215 s).
 *
 * @returns {{cx:number, cy:number, r:number, complete:boolean}|null}
 *   complete === false when the disc runs off the frame (zoomed-in phase).
 */
function estimateGlobe(px, w, h) {
  const pts = [];
  for (let y = 0; y < h; y += GLOBE_STEP) {
    let bestStart = -1, bestLen = 0, runStart = -1, runLen = 0;
    for (let x = 0; x < w; x += GLOBE_STEP) {
      const i = (y * w + x) * 4;
      const lit = luma(px[i], px[i + 1], px[i + 2]) >= GLOBE_LUMA;
      if (lit) {
        if (runStart < 0) { runStart = x; runLen = 0; }
        runLen++;
        if (runLen > bestLen) { bestLen = runLen; bestStart = runStart; }
      } else {
        runStart = -1;
        runLen = 0;
      }
    }
    // A short run is a star field speck or a lightning cluster, not the disc.
    if (bestLen >= GLOBE_MIN_RUN) pts.push(bestStart, y);
  }

  const n = pts.length / 2;
  if (n < 8) return null;

  // Kasa circle fit, refined by dropping the worst-fitting 15 % each round.
  let cx = 0, cy = 0, r = 0, keep = pts;
  for (let round = 0; round < 5; round++) {
    const m = keep.length / 2;
    if (m < 6) break;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    for (let k = 0; k < keep.length; k += 2) {
      const x = keep[k], y = keep[k + 1], z = x * x + y * y;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      sxz += x * z; syz += y * z; sz += z;
    }
    // Solve the 3×3 normal equations [x y 1]·[a b c]ᵀ = x²+y² by Cramer's rule.
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, m]];
    const b = [sxz, syz, sz];
    const det = (M) =>
      M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
      M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
      M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(A);
    if (!Number.isFinite(D) || Math.abs(D) < 1e-6) return null;
    const swap = (col, v) => A.map((row, i) => row.map((val, j) => (j === col ? v[i] : val)));
    const a = det(swap(0, b)) / D;
    const bb = det(swap(1, b)) / D;
    const c = det(swap(2, b)) / D;
    cx = a / 2;
    cy = bb / 2;
    r = Math.sqrt(c + cx * cx + cy * cy);
    if (!Number.isFinite(r) || r <= 0) return null;

    const res = [];
    for (let k = 0; k < keep.length; k += 2) {
      res.push(Math.abs(Math.hypot(keep[k] - cx, keep[k + 1] - cy) - r));
    }
    const sorted = res.slice().sort((p, q) => p - q);
    const limit = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))];
    const next = [];
    for (let k = 0; k < keep.length; k += 2) {
      if (res[k / 2] <= limit) next.push(keep[k], keep[k + 1]);
    }
    keep = next;
  }

  const complete = cx - r > 2 * GLOBE_STEP && cy - r > 2 * GLOBE_STEP
    && cx + r < w - 2 * GLOBE_STEP && cy + r < h - 2 * GLOBE_STEP;
  return { cx, cy, r, complete };
}

/** Image-space normalisation for an event centroid (see LIGHTNING SEMANTICS). */
function normaliseFlash(cx, cy, globe, w, h) {
  if (globe && globe.complete && globe.r > 0) {
    const d = 2 * globe.r;
    // Strikes near the limb can sit just outside the disc box, so the range is
    // deliberately not clamped to 0..1 (values stay within roughly -0.2..1.2).
    return { nx: (cx - (globe.cx - globe.r)) / d, ny: (cy - (globe.cy - globe.r)) / d, space: 'globe' };
  }
  return { nx: cx / w, ny: cy / h, space: 'screen' };
}

/**
 * Source-resolution flash detection with connected-component grouping and
 * cross-frame deduplication.
 *
 * @returns {{grid: (number|null)[], mean: number, max: number,
 *            columns: number[], flashes: object[], change: number,
 *            space: string}|null} null when no cell is unmasked
 */
function extractFlashes(px, w, h, gw, gh, cfg, masks, curTime, flashState) {
  const ex = cfg?.extract ?? {};
  const coreR = ex.core?.r ?? 240;
  const coreG = ex.core?.g ?? 240;
  const haloR = ex.halo?.r ?? 185;
  const haloG = ex.halo?.g ?? 165;
  const haloBMax = ex.halo?.bMax ?? 145;
  const haloRB = ex.halo?.rMinusB ?? 70;
  const minHalo = ex.minHaloPixels ?? 2;
  const minArea = ex.minArea ?? 2;
  const maxArea = ex.maxArea ?? 400;
  const dedupPixels = ex.dedupPixels ?? 4;
  const dedupNorm = ex.dedupNorm ?? 0.02;
  const resetNorm = ex.resetNorm ?? 0.3;
  const changeThreshold = ex.changeThreshold ?? 0;

  const n = w * h;
  const { core, lit, visited, stack } = flashBuffers(w, h);
  let litCount = 0;

  // ---- 1. source-resolution pixel masks (core + halo)
  // The dark globe dominates the frame, so reject on green first (both the core
  // and the halo need g >= 165): one comparison instead of six for ~95% of pixels.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      const g = px[i + 1];
      if (g < haloG) continue;
      const r = px[i];
      if (r >= coreR && g >= coreG) {
        lit[row + x] = 1;
        core[row + x] = 1;
        litCount++;
        continue;
      }
      const b = px[i + 2];
      if (r >= haloR && b <= haloBMax && (r - b) >= haloRB) {
        lit[row + x] = 1;
        litCount++;
      }
    }
  }

  // ---- 2. annotation exclusion (control panel, clock, wheel)
  for (let k = 0; k < masks.length; k++) {
    const m = masks[k];
    const x0 = Math.max(0, m.x | 0), x1 = Math.min(w, (m.x | 0) + (m.w | 0));
    const y0 = Math.max(0, m.y | 0), y1 = Math.min(h, (m.y | 0) + (m.h | 0));
    for (let y = y0; y < y1; y++) {
      const row = y * w;
      for (let x = x0; x < x1; x++) {
        if (lit[row + x]) { lit[row + x] = 0; litCount--; }
        core[row + x] = 0;
      }
    }
  }

  // ---- 3. temporal context
  const prev = flashState;
  const globe = estimateGlobe(px, w, h);
  let comparable = prev.width === w && prev.height === h && !!prev.lit;
  if (curTime === null || prev.time === null) {
    comparable = false;
  } else {
    const dt = curTime - prev.time;
    if (dt <= 0 || dt > 1.5) comparable = false;
  }
  if (comparable && prev.globe && globe) {
    // A cut, zoom or large pan invalidates pixel-level comparison.
    const diam = Math.max(1, 2 * Math.min(prev.globe.r, globe.r));
    const shift = Math.hypot(globe.cx - prev.globe.cx, globe.cy - prev.globe.cy) / diam;
    const scale = Math.abs(globe.r - prev.globe.r) / Math.max(prev.globe.r, globe.r);
    if (shift > resetNorm || scale > resetNorm) comparable = false;
  }

  // ---- 4. connected components over core|halo
  const strikes = [];
  let rejected = 0;   // blobs outside the globe silhouette

  for (let p = 0; p < n; p++) {
    if (!lit[p] || visited[p]) continue;
    let sp = 0;
    stack[sp++] = p;
    visited[p] = 1;
    const pixels = [];
    let area = 0, sumX = 0, sumY = 0, coreCount = 0, haloCount = 0, coreSum = 0;

    while (sp > 0) {
      const q = stack[--sp];
      const qx = q % w;
      const qy = (q - qx) / w;
      pixels.push(q);
      area++;
      sumX += qx;
      sumY += qy;
      if (core[q]) {
        coreCount++;
        const i = q * 4;
        coreSum += luma(px[i], px[i + 1], px[i + 2]);
      } else {
        haloCount++;
      }
      for (let dy = -1; dy <= 1; dy++) {
        const ny = qy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx;
          if (nx < 0 || nx >= w) continue;
          const r2 = ny * w + nx;
          if (!lit[r2] || visited[r2]) continue;
          visited[r2] = 1;
          stack[sp++] = r2;
        }
      }
    }

    // A strike needs a hot core AND a yellow halo: stars, the ISS track line and
    // its label are bright but have no yellow, so they never qualify.
    if (coreCount < 1 || haloCount < minHalo) continue;
    if (area < minArea || area > maxArea) continue;

    const cx = sumX / area;
    const cy = sumY / area;
    const pos = normaliseFlash(cx, cy, globe, w, h);

    // ---- 4b. globe-boundary check. Lightning happens on Earth's disc, so a blob
    // beyond the silhouette is not a strike (stray star, compression sparkle).
    // Only applied when the whole disc is in frame; a cropped globe has no edge
    // to test against, and those frames report screen-relative coordinates.
    if (globe && globe.complete) {
      const dist = Math.hypot(cx - globe.cx, cy - globe.cy);
      if (dist > globe.r * GLOBE_PAD) {
        rejected++;
        continue;
      }
    }

    // ---- 5. new-event test: previously lit pixels and previous events
    let alreadyLit = 0;
    if (comparable) {
      for (let k = 0; k < pixels.length; k++) {
        const q = pixels[k];
        const qx = q % w;
        const qy = (q - qx) / w;
        let hit = false;
        for (let dy = -dedupPixels; dy <= dedupPixels && !hit; dy++) {
          const yy = qy + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -dedupPixels; dx <= dedupPixels; dx++) {
            const xx = qx + dx;
            if (xx < 0 || xx >= w) continue;
            if (prev.lit[yy * w + xx]) { hit = true; break; }
          }
        }
        if (hit) alreadyLit++;
      }
    }

    const isNew = comparable
      && alreadyLit / pixels.length < 0.5
      && !prev.events.some((e) => Math.hypot(e.nx - pos.nx, e.ny - pos.ny) < dedupNorm);

    strikes.push({
      x: cx,
      y: cy,
      nx: pos.nx,
      ny: pos.ny,
      space: pos.space,
      intensity: Math.round((coreSum / coreCount / 255) * 100 * 100) / 100,
      isNew,
    });
  }

  // ---- 6. screen-space density grid, columns and change
  const cellMasked = new Uint8Array(gw * gh);
  for (let k = 0; k < masks.length; k++) {
    const m = masks[k];
    const c0 = Math.max(0, Math.floor((m.x / w) * gw));
    const c1 = Math.min(gw - 1, Math.floor(((m.x + m.w - 1) / w) * gw));
    const r0 = Math.max(0, Math.floor((m.y / h) * gh));
    const r1 = Math.min(gh - 1, Math.floor(((m.y + m.h - 1) / h) * gh));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) cellMasked[r * gw + c] = 1;
    }
  }

  const counts = new Array(gw * gh).fill(0);
  const flashes = [];
  for (let k = 0; k < strikes.length; k++) {
    const s = strikes[k];
    const c = Math.min(gw - 1, Math.max(0, Math.floor((s.x / w) * gw)));
    const r = Math.min(gh - 1, Math.max(0, Math.floor((s.y / h) * gh)));
    const cell = r * gw + c;
    counts[cell]++;
    if (s.isNew) {
      flashes.push({
        x: Math.round(s.x * 100) / 100,
        y: Math.round(s.y * 100) / 100,
        nx: Math.round(s.nx * 10000) / 10000,
        ny: Math.round(s.ny * 10000) / 10000,
        intensity: s.intensity,
        cell,
      });
    }
  }

  const grid = new Array(gw * gh).fill(null);
  const columns = new Array(gw).fill(0);
  let sum = 0, count = 0, max = 0, changed = 0, compareCount = 0;
  for (let r = 0; r < gh; r++) {
    for (let c = 0; c < gw; c++) {
      const i = r * gw + c;
      if (cellMasked[i]) continue;
      grid[i] = counts[i];
      sum += counts[i];
      count++;
      if (counts[i] > max) max = counts[i];
      columns[c] += counts[i];
      if (comparable && prev.counts && prev.counts.length === counts.length) {
        compareCount++;
        if (Math.abs(counts[i] - prev.counts[i]) > changeThreshold) changed++;
      }
    }
  }

  if (count === 0) return null;

  // One space per frame: globe-relative only when the whole disc is in frame.
  const space = globe && globe.complete ? 'globe' : 'screen';
  const change = compareCount ? changed / compareCount : 0;

  // ---- 7. remember this frame (copy: the scratch buffer is reused next call)
  if (!flashState.lit || flashState.lit.length !== n) flashState.lit = new Uint8Array(n);
  flashState.lit.set(lit);
  flashState.width = w;
  flashState.height = h;
  flashState.globe = globe;
  flashState.events = strikes.map((s) => ({ nx: s.nx, ny: s.ny }));
  flashState.counts = counts;
  flashState.time = curTime;

  return {
    grid,
    mean: sum / count,
    max,
    columns,
    flashes,
    change,
    space,
    rejected,
    globe: globe
      ? { cx: Math.round(globe.cx), cy: Math.round(globe.cy), r: Math.round(globe.r), complete: globe.complete }
      : null,
  };
}

// =============================================================================
// AEROSOL SEMANTICS (mode: "layers")
// =============================================================================
// The GEOS Aerosols render draws four modelled species as translucent colour
// layers over a dark base map (black ocean, neutral gray land). The burned-in
// legend gives the FULL-STRENGTH swatch of each species; on screen every plume
// pixel is the same hue at a lower brightness and chroma.
//
// Measured, not assumed (see media/README.md for the full audit):
//   legend swatch   rgb            hue    chroma  value
//   Black Carbon    (208, 93, 65)   11.7   0.56    0.82
//   Sulfate         ( 81,219, 53)  109.9   0.65    0.86
//   Sea Salt        (134,167,164)  174.5   0.13    0.65
//   Dust            (191,151,219)  275.3   0.27    0.86
// Plume pixels measured on the frame keep those hues: dust (162,130,187) H=275,
// sea salt (51,82,77) H=173, sulfate (37,82,29) H=113, black carbon (119,70,46)
// H=17 — i.e. alpha-dimmed swatches, so HUE is the stable, brightness-independent
// cue and RGB distance is not.
//
// 1. grid: Array(gw*gh) of relative VISUAL aerosol density 0..1 per cell — the
//    fraction of the cell's unmasked pixels that classify as any aerosol. It is
//    a picture-coverage measure, NOT an aerosol optical depth, a mass
//    concentration or any physical quantity. A cell touched by an annotation
//    mask is null (no data).
// 2. mean: mean density over unmasked cells. max: densest unmasked cell.
// 3. columns: Array(gw) mean density per screen column (left → right).
// 4. flashes: always [].
// 5. change: fraction of unmasked cells whose density moved more than
//    extract.changeThreshold since the previous analysed frame.
// 6. layers: relative VISUAL proportion of each species — that species' share
//    of all classified aerosol pixels, 0..1, summing to 1 across the four keys
//    (black_carbon, dust, sea_salt, sulfate). A proportion of coloured picture
//    area, NOT a proportion of aerosol mass.
// 7. aerosolPixels / aerosolAmbiguous / aerosolMasked: pixel counts, for
//    validation. Ambiguous = a pixel is within hueTolerance of two species, or
//    within ambiguityBand of the hue boundary between two species (a mixture or
//    an edge pixel). Such pixels are counted but never assigned, so no plume is
//    ever silently split between two species.
//
// Classification is per pixel at source resolution: V >= brightnessFloor × the
// swatch's own value, chroma >= chromaFloor × the swatch's own chroma (relative
// floors, because sea salt's swatch is far dimmer and greyer than sulfate's),
// then the nearest species hue within hueTolerance degrees.

const AEROSOL_FALLBACK = {
  brightnessFloor: 0.26,
  chromaFloor: 0.25,
  hueTolerance: 26,
  ambiguityBand: 7,
  changeThreshold: 0.02,
};

/** Shortest angular distance between two hues, 0..180 degrees. */
function hueDelta(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Reused annotation-mask bitmap for the aerosol extractor (see extractLayers). */
const layerMaskCache = { w: 0, h: 0, sig: 0, flag: null, count: 0 };

/**
 * Per-pixel aerosol classification into the four canonical species.
 *
 * @returns {{grid: (number|null)[], mean: number, max: number, columns: number[],
 *            change: number, layers: object, layerPixels: object,
 *            classified: number, ambiguous: number, masked: number}|null}
 *   null when no cell is analysable (everything masked).
 */
function extractLayers(px, w, h, gw, gh, cfg, masks, state) {
  const ex = cfg?.extract ?? {};
  const classesCfg = ex.classes;
  if (!classesCfg || typeof classesCfg !== 'object') return null;
  const keys = Object.keys(classesCfg);
  const nc = keys.length;
  if (!nc) return null;

  const hueTol = ex.hueTolerance ?? AEROSOL_FALLBACK.hueTolerance;
  const band = ex.ambiguityBand ?? AEROSOL_FALLBACK.ambiguityBand;
  const chromaFloor = ex.chromaFloor ?? AEROSOL_FALLBACK.chromaFloor;
  const brightnessFloor = ex.brightnessFloor ?? AEROSOL_FALLBACK.brightnessFloor;
  const changeThreshold = ex.changeThreshold ?? AEROSOL_FALLBACK.changeThreshold;

  // Per-species hue and the floors derived from each swatch's own chroma/value.
  // Floors are kept as INTEGER 0..255 thresholds: the inner loop then compares
  // bytes and never divides by 255.
  const hues = new Float64Array(nc);
  const chromaMinI = new Int32Array(nc);
  const valueMinI = new Int32Array(nc);
  let globalCMinI = 255;
  let globalVMinI = 255;
  for (let k = 0; k < nc; k++) {
    const c = classesCfg[keys[k]] ?? {};
    hues[k] = Number.isFinite(c.hue) ? c.hue : 0;
    const rgb = Array.isArray(c.rgb) && c.rgb.length === 3 ? c.rgb : [128, 128, 128];
    const mx = Math.max(rgb[0], rgb[1], rgb[2]);
    const mn = Math.min(rgb[0], rgb[1], rgb[2]);
    const chroma = mx - mn;
    chromaMinI[k] = Math.ceil(chromaFloor * (chroma > 0 ? chroma : 51));
    valueMinI[k] = Math.ceil(brightnessFloor * (mx > 0 ? mx : 255));
    if (chromaMinI[k] < globalCMinI) globalCMinI = chromaMinI[k];
    if (valueMinI[k] < globalVMinI) globalVMinI = valueMinI[k];
  }

  // Hue boundaries between adjacent species (midpoints of the sorted hues):
  // a pixel sitting on one is a mixture the picture cannot resolve.
  const order = keys.map((_, k) => k).sort((a, b) => hues[a] - hues[b]);
  const bounds = new Float64Array(nc);
  for (let i = 0; i < nc; i++) {
    let a = hues[order[i]];
    let b = hues[order[(i + 1) % nc]];
    if (b < a) b += 360;
    bounds[i] = ((a + b) / 2) % 360;
  }

  // ---- annotation mask lookup (legend, event captions)
  // The mask is static for a dataset, so its 819 200-byte flag array is built once
  // and reused: re-allocating it per frame was the only source of GC pauses here.
  const n = w * h;
  let sig = masks.length * 31;
  for (let k = 0; k < masks.length; k++) {
    const m = masks[k];
    sig = (sig + (m.x | 0) * 7 + (m.y | 0) * 13 + (m.w | 0) * 17 + (m.h | 0) * 19) | 0;
  }
  if (layerMaskCache.w !== w || layerMaskCache.h !== h || layerMaskCache.sig !== sig
      || !layerMaskCache.flag || layerMaskCache.flag.length !== n) {
    const flag = new Uint8Array(n);
    let count = 0;
    for (let k = 0; k < masks.length; k++) {
      const m = masks[k];
      const x0 = Math.max(0, m.x | 0), x1 = Math.min(w, (m.x | 0) + (m.w | 0));
      const y0 = Math.max(0, m.y | 0), y1 = Math.min(h, (m.y | 0) + (m.h | 0));
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          if (!flag[row + x]) { flag[row + x] = 1; count++; }
        }
      }
    }
    layerMaskCache.w = w;
    layerMaskCache.h = h;
    layerMaskCache.sig = sig;
    layerMaskCache.flag = flag;
    layerMaskCache.count = count;
  }
  const maskFlag = layerMaskCache.flag;
  const masked = layerMaskCache.count;

  const cells = gw * gh;
  const cellValid = new Int32Array(cells);
  const cellAerosol = new Int32Array(cells);
  const cellMasked = new Uint8Array(cells);
  const classCount = new Int32Array(nc);
  const colW = w / gw;
  const rowH = h / gh;

  let classified = 0;
  let ambiguous = 0;

  for (let y = 0; y < h; y++) {
    const cellRow = Math.min(gh - 1, (y / rowH) | 0) * gw;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const p = rowOff + x;
      const cell = cellRow + Math.min(gw - 1, (x / colW) | 0);
      if (maskFlag[p]) { cellMasked[cell] = 1; continue; }
      cellValid[cell]++;

      const i = p * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      let mx = r, mn = r;
      if (g > mx) mx = g;
      if (b > mx) mx = b;
      if (g < mn) mn = g;
      if (b < mn) mn = b;

      // Cheap integer rejects first: the dark base map is most of the frame.
      if (mx < globalVMinI) continue;
      const d = mx - mn;
      if (d < globalCMinI) continue;

      // ---- 1. cheap eligibility pass (no hue yet): which species could this be?
      let eligible = 0;
      for (let k = 0; k < nc; k++) {
        if (mx >= valueMinI[k] && d >= chromaMinI[k]) eligible |= 1 << k;
      }
      if (eligible === 0) continue;

      // ---- 2. hue (standard branch on the max channel)
      let hue;
      if (mx === r) hue = ((g - b) / d) * 60;
      else if (mx === g) hue = ((b - r) / d) * 60 + 120;
      else hue = ((r - g) / d) * 60 + 240;
      if (hue < 0) hue += 360;
      else if (hue >= 360) hue -= 360;

      // ---- 3. distance to each eligible species hue
      let best = -1;
      let bestD = 1e9;
      let hits = 0;
      let nearSpecies = 0;
      for (let k = 0; k < nc; k++) {
        if ((eligible & (1 << k)) === 0) continue;
        let dh = hue - hues[k];
        if (dh < 0) dh = -dh;
        if (dh > 180) dh = 360 - dh;
        if (dh <= hueTol + band) nearSpecies++;
        if (dh > hueTol) continue;
        hits++;
        if (dh < bestD) { bestD = dh; best = k; }
      }

      let nearBoundary = false;
      for (let bIdx = 0; bIdx < nc; bIdx++) {
        let db = hue - bounds[bIdx];
        if (db < 0) db = -db;
        if (db > 180) db = 360 - db;
        if (db <= band) { nearBoundary = true; break; }
      }

      // A mixture: eligible for two species, or sitting on the hue boundary
      // BETWEEN two species while still being close to a species colour. A hue
      // that belongs to no species and is nowhere near one (the blue base-map
      // tint, for example) is background, not ambiguity.
      if (hits > 1 || (hits === 1 && nearBoundary) || (hits === 0 && nearBoundary && nearSpecies > 0)) {
        ambiguous++;
        continue;
      }
      if (hits === 0) continue;          // base map / unclassifiable colour

      classified++;
      classCount[best]++;
      cellAerosol[cell]++;
    }
  }

  const grid = new Array(cells).fill(null);
  const columns = new Array(gw).fill(null);
  const colSum = new Float64Array(gw);
  const colCount = new Int32Array(gw);
  let sum = 0, count = 0, max = 0;

  for (let r2 = 0; r2 < gh; r2++) {
    for (let c2 = 0; c2 < gw; c2++) {
      const idx = r2 * gw + c2;
      if (cellMasked[idx] || cellValid[idx] === 0) continue;
      const density = cellAerosol[idx] / cellValid[idx];
      grid[idx] = density;
      sum += density;
      count++;
      if (density > max) max = density;
      colSum[c2] += density;
      colCount[c2]++;
    }
  }
  if (count === 0) return null;

  for (let c3 = 0; c3 < gw; c3++) {
    columns[c3] = colCount[c3] ? colSum[c3] / colCount[c3] : null;
  }

  let change = 0;
  if (state.grid && state.grid.length === grid.length) {
    change = changeFraction(grid, state.grid, changeThreshold);
  }
  state.grid = grid;

  const layers = {};
  const layerPixels = {};
  for (let k = 0; k < nc; k++) {
    layers[keys[k]] = classified ? classCount[k] / classified : 0;
    layerPixels[keys[k]] = classCount[k];
  }

  return {
    grid,
    mean: sum / count,
    max,
    columns,
    change,
    layers,
    layerPixels,
    classified,
    ambiguous,
    masked,
  };
}

/**
 * Analyse the current video frame.
 * Extracts video crop, samples representative flow colours per grid cell,
 * inverts colors to calibrated physical units, and produces feature metrics.
 *
 * @param {HTMLVideoElement} video
 * @param {object} cfg dataset config (datasets/*.json)
 * @param {object} [opts={}] optional configuration (e.g. { fake: true } for synthetic dev mode)
 * @returns {object} features (see top of file)
 */
export function analyze(video, cfg, opts = {}) {
  // Explicit synthetic mode for development/testing only
  if (opts.fake === true) {
    return fakeFeatures(cfg);
  }

  // Safe fallback to empty features when video is unready or missing
  if (!video || video.readyState < 2 || !video.videoWidth || !work || !ctx) {
    return emptyFeatures(cfg);
  }

  const gw = cfg?.grid?.w ?? 32;
  const gh = cfg?.grid?.h ?? 16;
  const crop = cfg?.crop ?? { x: 0, y: 0, w: video.videoWidth, h: video.videoHeight };
  const cropX = crop.x ?? 0;
  const cropY = crop.y ?? 0;
  const cropW = crop.w ?? video.videoWidth;
  const cropH = crop.h ?? video.videoHeight;

  const curTime = typeof video.currentTime === 'number' ? video.currentTime : null;

  // ---- segment gate: a dataset may declare that only parts of the video are
  // meaningful for sonification (e.g. Night Lights' diverging change map).
  const { segment, key: segmentKey } = resolveSegment(cfg, curTime);
  if (segment === null) {
    // Outside every declared segment: stay silent, and forget temporal state so
    // the next analysed frame starts from change = 0.
    history.delete(video);
    return emptyFeatures(cfg);
  }
  let state = history.get(video);
  const dt = curTime !== null && state?.time != null ? curTime - state.time : 0;
  if (!state || state.cfg !== cfg || state.segmentKey !== segmentKey || dt < 0 || dt > 1.5) {
    state = { cfg, segmentKey, grid: null, time: null, flash: null };
    history.set(video, state);
  }
  state.time = curTime;

  const masks = [
    ...(Array.isArray(cfg?.masks) ? cfg.masks : []),
    ...(Array.isArray(segment?.masks) ? segment.masks : []),
  ];

  const stops = cfg?.colorbar?.stops;
  const maxDist = cfg?.colorbar?.maxDist ?? 60;
  const extractMode = cfg?.extract?.mode ?? null;

  const prevGrid = state.grid;

  try {
    if (work.width !== cropW || work.height !== cropH) {
      work.width = cropW;
      work.height = cropH;
    }

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const px = ctx.getImageData(0, 0, cropW, cropH).data;

    // ---- non-colourbar extractors (per-dataset preprocessing)
    if (extractMode === 'flashes') {
      const out = extractFlashes(px, cropW, cropH, gw, gh, cfg, masks, curTime, state.flash ??= createFlashState());
      if (!out) return emptyFeatures(cfg);
      return {
        grid: out.grid,
        mean: out.mean,
        max: out.max,
        columns: out.columns,
        flashes: out.flashes,
        change: out.change,
        layers: {},
        phase: segment?.mode ?? null,
        // 'globe' when nx/ny are globe-relative, 'screen' when frame-relative.
        flashSpace: out.space,
        // Estimated globe disc for the frame (null when no disc was found).
        flashGlobe: out.globe,
        // Blobs dropped because they were outside the globe silhouette.
        flashRejected: out.rejected,
      };
    }

    if (extractMode === 'layers') {
      const out = extractLayers(px, cropW, cropH, gw, gh, cfg, masks, state);
      if (!out) return emptyFeatures(cfg);
      return {
        grid: out.grid,
        mean: out.mean,
        max: out.max,
        columns: out.columns,
        flashes: [],
        change: out.change,
        layers: out.layers,
        phase: segment?.mode ?? null,
        // Pixel counts for validation: classified aerosol, ambiguous (mixture or
        // species boundary) and annotation-masked pixels on this frame.
        aerosolPixels: out.classified,
        aerosolAmbiguous: out.ambiguous,
        aerosolMasked: out.masked,
        layerPixels: out.layerPixels,
      };
    }

    if (extractMode === 'brightness') {
      const out = extractBrightness(px, cropW, cropH, gw, gh, cfg, masks, state);
      if (!out) return emptyFeatures(cfg);
      return {
        grid: out.grid,
        mean: out.mean,
        max: out.max,
        columns: out.columns,
        flashes: [],
        change: out.change,
        layers: {},
        phase: segment?.mode ?? null,
      };
    }

    // ---- original SST colourbar-inversion path (unchanged)
    const totalCells = gw * gh;
    const grid = new Array(totalCells);
    const colSum = new Array(gw).fill(0);
    const colCount = new Array(gw).fill(0);
    let sum = 0, count = 0, max = -Infinity;

    // Sub-sample a grid of points within each cell to capture representative flow colours
    // rather than naive area averages that blur thin current filaments with black ocean floor.
    const SAMPLES_Y = 5;
    const SAMPLES_X = 5;

    for (let r = 0; r < gh; r++) {
      const y0 = Math.floor(r * cropH / gh);
      const y1 = Math.floor((r + 1) * cropH / gh);

      for (let c = 0; c < gw; c++) {
        const x0 = Math.floor(c * cropW / gw);
        const x1 = Math.floor((c + 1) * cropW / gw);
        const cellVals = [];

        for (let sy = 0; sy < SAMPLES_Y; sy++) {
          const py = Math.floor(y0 + (y1 - y0) * (sy + 0.5) / SAMPLES_Y);
          const rowOffset = py * cropW * 4;

          for (let sx = 0; sx < SAMPLES_X; sx++) {
            const pxCoord = Math.floor(x0 + (x1 - x0) * (sx + 0.5) / SAMPLES_X);
            if (masks.length && inMask(pxCoord, py, masks)) continue;
            const idx = rowOffset + pxCoord * 4;
            const v = colorToValue(px[idx], px[idx + 1], px[idx + 2], stops, maxDist);
            if (v !== null) {
              cellVals.push(v);
            }
          }
        }

        const cellIndex = r * gw + c;
        if (cellVals.length > 0) {
          // Median of valid sampled points in cell provides robust representative temperature
          cellVals.sort((a, b) => a - b);
          const mid = Math.floor(cellVals.length / 2);
          const cellValue = cellVals.length % 2 !== 0
            ? cellVals[mid]
            : (cellVals[mid - 1] + cellVals[mid]) / 2;

          grid[cellIndex] = cellValue;
          sum += cellValue;
          count++;
          if (cellValue > max) max = cellValue;
          colSum[c] += cellValue;
          colCount[c]++;
        } else {
          grid[cellIndex] = null;
        }
      }
    }

    if (count === 0) return emptyFeatures(cfg);

    // Fraction of cells whose value changed noticeably since the last frame.
    // Reflects visual streamline advection across grid cells.
    let changed = 0;
    if (prevGrid && prevGrid.length === grid.length) {
      for (let i = 0; i < grid.length; i++) {
        const curr = grid[i];
        const prev = prevGrid[i];
        if (curr !== null && prev !== null) {
          if (Math.abs(curr - prev) > 0.5) changed++;
        } else if ((curr === null) !== (prev === null)) {
          changed++;
        }
      }
    }
    const change = prevGrid ? changed / grid.length : 0;
    state.grid = grid;

    return {
      grid,
      mean: sum / count,
      max,
      columns: colSum.map((s, i) => (colCount[i] ? s / colCount[i] : null)),
      flashes: [],
      change,
      layers: {},
    };
  } catch (err) {
    // When an error occurs (e.g. cross-origin canvas taint), fall back safely to empty features.
    console.warn('analyze: falling back to empty features', err);
    return emptyFeatures(cfg);
  }
}

/** Reset frame-to-frame state (call when switching dataset or seeking). */
export function resetAnalyzer() {
  history = new WeakMap();
}
