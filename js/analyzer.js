// Owner: Aahana · Support: Celene
// Frame analysis: video frame → crop → grid → colorbar inversion → features.
//
// features = {
//   grid:    Array(gw*gh) of values (°C, radiance, ...) or null where no data,
//   mean:    average of non-null grid values,
//   max:     largest grid value,
//   columns: Array(gw) — mean of each column (west → east), used by Scan mode,
//   flashes: [{ x, y, value }] — sudden bright cells (lightning),
//   change:  0..1 — how much the grid changed since the previous frame,
//   layers:  { dust: 0..1, smoke: 0..1, ... } — per-layer strength (aerosols)
// }

import { colorToValue } from './colorbar.js';

const work = document.createElement('canvas');
const ctx = work.getContext('2d', { willReadFrequently: true });
let prevGrid = null;

/** Fake features with the right shape so the sound and UI work without a video. */
export function fakeFeatures(cfg) {
  const gw = cfg?.grid?.w ?? 32;
  const gh = cfg?.grid?.h ?? 16;
  // Gentle drift so the stub audibly changes over time.
  const wobble = Math.sin(performance.now() / 2000) * 5;
  return {
    grid: Array(gw * gh).fill(null),
    mean: 15 + wobble,
    max: 30,
    columns: Array(gw).fill(15 + wobble),
    flashes: [],
    change: 0.1,
    layers: {},
    fake: true,
  };
}

/**
 * Analyse the current video frame.
 * @param {HTMLVideoElement} video
 * @param {object} cfg dataset config (datasets/*.json)
 * @returns {object} features (see top of file)
 */
export function analyze(video, cfg) {
  if (!video || video.readyState < 2 || !video.videoWidth) return fakeFeatures(cfg);

  const gw = cfg.grid.w;
  const gh = cfg.grid.h;
  const crop = cfg.crop;
  const stops = cfg.colorbar.stops;
  const maxDist = cfg.colorbar.maxDist ?? 60;

  try {
    work.width = gw;
    work.height = gh;
    // Downscale the crop box straight to one pixel per grid cell.
    // TODO(Aahana): averaging colours across a cell can mix two colorbar colours into a
    // third one. Better: draw at a larger size and take the median / most common colour per cell.
    ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, gw, gh);
    const px = ctx.getImageData(0, 0, gw, gh).data;

    const grid = new Array(gw * gh);
    const colSum = new Array(gw).fill(0);
    const colCount = new Array(gw).fill(0);
    let sum = 0, count = 0, max = -Infinity;

    for (let i = 0; i < gw * gh; i++) {
      const v = colorToValue(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], stops, maxDist);
      grid[i] = v;
      if (v !== null) {
        sum += v; count++;
        if (v > max) max = v;
        colSum[i % gw] += v; colCount[i % gw]++;
      }
    }

    if (count === 0) return fakeFeatures(cfg);

    // Fraction of cells whose value changed noticeably since the last frame.
    let changed = 0;
    if (prevGrid && prevGrid.length === grid.length) {
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== null && prevGrid[i] !== null && Math.abs(grid[i] - prevGrid[i]) > 0.5) changed++;
      }
    }
    prevGrid = grid;

    return {
      grid,
      mean: sum / count,
      max,
      columns: colSum.map((s, i) => (colCount[i] ? s / colCount[i] : null)),
      flashes: [], // TODO(Aahana): detect cells that jump bright vs prevGrid (lightning flashes)
      change: changed / grid.length,
      layers: {},  // TODO(Aahana): per-layer strength for aerosols (dust/smoke/salt/sulfate by hue)
    };
  } catch (err) {
    // e.g. a cross-origin video taints the canvas — fall back so the app keeps running.
    console.warn('analyze: falling back to fake features', err);
    return fakeFeatures(cfg);
  }
}

/** Reset frame-to-frame state (call when switching dataset or seeking). */
export function resetAnalyzer() {
  prevGrid = null;
}
