// Owner: Freia · Support: Aahana
// Sample data for datasets whose video isn't downloaded yet, shaped to fit each mapper,
// so every dataset can still be heard. Always marked `fake: true` and shown as
// "(sample data)" in the readout. Real playback always uses analyzer.analyze().

import { valueRange } from './scales.js';

let seed = 1;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function smoothGrid(gw, gh, t, min, max) {
  const grid = new Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const p = 0.5 + 0.3 * Math.sin(x / 4 + t / 6) + 0.2 * Math.cos(y / 2.5 - t / 9);
      grid[y * gw + x] = min + Math.min(1, Math.max(0, p)) * (max - min);
    }
  }
  return grid;
}

function summary(grid, gw) {
  let sum = 0, n = 0, max = -Infinity;
  const colSum = new Array(gw).fill(0), colN = new Array(gw).fill(0);
  grid.forEach((v, i) => {
    if (v === null) return;
    sum += v; n++; max = Math.max(max, v);
    colSum[i % gw] += v; colN[i % gw]++;
  });
  return {
    mean: n ? sum / n : null,
    max: n ? max : null,
    columns: colSum.map((s, i) => (colN[i] ? s / colN[i] : null)),
  };
}

/**
 * Sample features for a dataset at media time t (seconds).
 * @param {object} cfg dataset config
 * @param {number} t media time in seconds
 */
export function demoFeatures(cfg, t) {
  const gw = cfg.grid?.w ?? 32;
  const gh = cfg.grid?.h ?? 16;
  const [min, max] = valueRange(cfg);
  const kind = cfg.sound?.mapper;
  let grid, flashes = [], layers = {};

  if (kind === 'events') {
    // A storm that drifts west to east, with a few flashes at a time.
    grid = new Array(gw * gh).fill(null);
    const cx = (t * 1.5) % gw;
    const count = Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const x = Math.max(0, Math.min(gw - 1, Math.round(cx + (rand() - 0.5) * 8)));
      const y = Math.max(0, Math.min(gh - 1, Math.round(gh / 2 + (rand() - 0.5) * 8)));
      const value = min + (0.4 + 0.6 * rand()) * (max - min);
      flashes.push({ x, y, value });
      grid[y * gw + x] = value;
    }
  } else if (kind === 'density') {
    // City clusters whose lit area slowly grows over time.
    const growth = Math.min(1, t / 60);
    grid = new Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const city = Math.max(0, Math.sin(x * 1.7) * Math.cos(y * 1.3)) + 0.3 * Math.sin(x / 5 + y / 3);
        grid[y * gw + x] = min + Math.min(1, Math.max(0, city * (0.5 + 0.5 * growth))) * (max - min);
      }
    }
  } else if (kind === 'layers') {
    grid = smoothGrid(gw, gh, t, min, max);
    const names = cfg.sound.instruments ?? [];
    names.forEach((name, i) => {
      layers[name] = Math.max(0, 0.5 + 0.45 * Math.sin(t / 7 + i * 1.6));
    });
  } else {
    grid = smoothGrid(gw, gh, t, min, max);
  }

  return { grid, ...summary(grid, gw), flashes, change: 0.1 + 0.05 * Math.sin(t / 3), layers, fake: true };
}
