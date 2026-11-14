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

import { colorToValue } from './colorbar.js';

const work = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const ctx = work ? work.getContext('2d', { willReadFrequently: true }) : null;
let prevGrid = null;
let prevTime = null;

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

  const stops = cfg?.colorbar?.stops;
  const maxDist = cfg?.colorbar?.maxDist ?? 60;

  // Detect video seeking, looping, or large temporal jumps to prevent invalid change metrics
  const curTime = typeof video.currentTime === 'number' ? video.currentTime : null;
  if (curTime !== null && prevTime !== null) {
    const dt = curTime - prevTime;
    if (dt < 0 || dt > 1.5) {
      prevGrid = null;
    }
  }
  prevTime = curTime;

  try {
    if (work.width !== cropW || work.height !== cropH) {
      work.width = cropW;
      work.height = cropH;
    }

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const px = ctx.getImageData(0, 0, cropW, cropH).data;

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
    prevGrid = grid;

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
  prevGrid = null;
  prevTime = null;
}
