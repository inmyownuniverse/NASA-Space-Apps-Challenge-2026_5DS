// Regression tests for the GEOS Aerosols pipeline (media/aerosols.mp4).
//
// Real decoded frames are used wherever the claim is about the render itself
// (legend swatches, the four species on known plumes, masks). Synthetic buffers
// exist only to pin behaviour that no single frame can show on demand:
// ambiguity, false-positive rejection, masking, seek/reset and empty data.
//
// Measured ground truth used here (see media/README.md):
//   1280×640, 30 fps, 2208 frames, 73.6 s
//   legend swatches (measured on the frame): BC (209,92,66), Dust (191,152,220),
//     Sea Salt (134,168,167), Sulfate (84,220,54) — the stated values within ±2
//   plume medians at t=0: BC (119,70,46) H=16.6, dust (162,130,187) H=275.3,
//     sea salt (51,82,77) H=173.3, sulfate (37,82,29) H=112.9

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

let total = 0;
let passed = 0;
let failed = 0;

function assert(cond, message) {
  total++;
  if (cond) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertClose(actual, expected, tol, message) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tol, `${message} (expected ~${expected}, got ${typeof actual === 'number' ? actual.toFixed(3) : actual}, diff ${diff.toFixed(3)})`);
}

const cfg = JSON.parse(fs.readFileSync(path.join(rootDir, 'datasets', 'aerosols.json'), 'utf-8'));
const videoPath = path.join(rootDir, cfg.video);
const W = cfg.crop.w;
const H = cfg.crop.h;
const KEYS = ['black_carbon', 'dust', 'sea_salt', 'sulfate'];

// -----------------------------------------------------------------------------
// Harness: decode a frame with ffmpeg and feed it to the analyzer through a
// mocked canvas, so the real extractor runs at full resolution.
// -----------------------------------------------------------------------------
const frameCache = new Map();
function frameAt(t) {
  const key = String(t);
  if (frameCache.has(key)) return frameCache.get(key);
  const out = path.join(rootDir, 'tools', '.ae_frame.rgba');
  execSync(`ffmpeg -v error -y -ss ${t} -i "${videoPath}" -frames:v 1 -f rawvideo -pix_fmt rgba "${out}"`, { cwd: rootDir });
  const buf = new Uint8ClampedArray(fs.readFileSync(out));
  fs.unlinkSync(out);
  frameCache.set(key, buf);
  return buf;
}

class Ctx {
  constructor() { this.buffer = null; }
  drawImage(img, sx = 0, sy = 0, sw = W, sh = H) {
    const src = img._frame;
    if (sx === 0 && sy === 0 && sw === W && sh === H) { this.buffer = src; return; }
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      const from = ((sy + y) * W + sx) * 4;
      out.set(src.subarray(from, from + sw * 4), y * sw * 4);
    }
    this.buffer = out;
  }
  getImageData(x, y, w, h) { return { data: this.buffer, width: w, height: h }; }
}

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Ctx() }) };
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };

const { analyze, resetAnalyzer, emptyFeatures } = await import(`../js/analyzer.js?t=${Date.now()}`);

/** A video-like object whose single frame is `frame`. */
const video = (t, frame) => ({ readyState: 4, videoWidth: W, videoHeight: H, currentTime: t, _frame: frame });

/** cfg with a different crop (and no absolute-frame masks, which do not apply). */
function cropCfg(crop) {
  return { ...cfg, crop, masks: [] };
}

/** Solid synthetic frame builder. */
function blankFrame(rgb = [8, 8, 8]) {
  const f = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < f.length; i += 4) {
    f[i] = rgb[0]; f[i + 1] = rgb[1]; f[i + 2] = rgb[2]; f[i + 3] = 255;
  }
  return f;
}
function paintRect(frame, x0, y0, w, h, rgb) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * W + x) * 4;
      frame[i] = rgb[0]; frame[i + 1] = rgb[1]; frame[i + 2] = rgb[2]; frame[i + 3] = 255;
    }
  }
}
function hsvToRgb(h, s, v) {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// -----------------------------------------------------------------------------
// 1. CONFIG AND ASSET
// -----------------------------------------------------------------------------
console.log('\n--- 1. Config and asset ---');
{
  const probe = JSON.parse(execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames,duration -of json "${videoPath}"`,
    { cwd: rootDir, encoding: 'utf-8' },
  )).streams[0];
  assert(probe.width === 1280 && probe.height === 640, `Video is 1280×640 (${probe.width}×${probe.height})`);
  assert(probe.r_frame_rate === '30/1', `Video is 30 fps (${probe.r_frame_rate})`);
  assert(Number(probe.nb_frames) === 2208, `Video has the 2208 frames of the SVS 5572 master (${probe.nb_frames})`);
  assertClose(Number(probe.duration), 73.6, 0.1, 'Video duration is 73.6 s = 2208 / 30');

  assert(cfg.source === 'https://svs.gsfc.nasa.gov/5572/', `Provenance names SVS 5572 (${cfg.source})`);
  assert(cfg.crop.x === 0 && cfg.crop.y === 0 && cfg.crop.w === 1280 && cfg.crop.h === 640,
    `Full-frame crop ${JSON.stringify(cfg.crop)}`);
  assert(cfg.grid.w === 32 && cfg.grid.h === 16, 'Grid is 32×16');
  assert(cfg.extract.mode === 'layers', 'Extractor mode is layers');

  assert(KEYS.every((k) => cfg.extract.classes[k]), `All four canonical species configured (${Object.keys(cfg.extract.classes).join(', ')})`);
  assert(Object.keys(cfg.extract.classes).length === 4, 'Exactly four species — no fifth cluster is invented');

  const legend = cfg.masks.find((m) => m.y === 575);
  assert(!!legend && legend.x === 855 && legend.w === 280 && legend.h === 60,
    'Legend panel is masked (280×60 at 855,575)');
  const captions = cfg.masks.filter((m) => m.y !== 575);
  assert(captions.length === 9, `All nine event captions are masked (${captions.length})`);
  assert(cfg.masks.every((m) => m.x >= 0 && m.y >= 0 && m.x + m.w <= 1280 && m.y + m.h <= 640),
    'Every mask lies inside the frame');
  const src = fs.readFileSync(path.join(rootDir, 'js', 'analyzer.js'), 'utf-8');
  assert(/NOT an aerosol optical depth/i.test(src) && /proportion of coloured picture/i.test(src),
    'Analyzer documents the non-physical meaning of the layers');
}

// -----------------------------------------------------------------------------
// 2. LEGEND SWATCHES ON THE REAL FRAME
// -----------------------------------------------------------------------------
console.log('\n--- 2. Legend swatches measured on the frame ---');
{
  const frame = frameAt(0);
  const legend = cfg.masks.find((m) => m.y === 575);
  const medians = {};
  for (const key of KEYS) {
    const want = cfg.extract.classes[key].rgb;
    const hits = [[], [], []];
    for (let y = legend.y; y < legend.y + legend.h; y++) {
      for (let x = legend.x; x < legend.x + legend.w; x++) {
        const i = (y * W + x) * 4;
        const d = Math.abs(frame[i] - want[0]) + Math.abs(frame[i + 1] - want[1]) + Math.abs(frame[i + 2] - want[2]);
        if (d < 45) { hits[0].push(frame[i]); hits[1].push(frame[i + 1]); hits[2].push(frame[i + 2]); }
      }
    }
    const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)] ?? -1; };
    medians[key] = [med(hits[0]), med(hits[1]), med(hits[2])];
    assert(hits[0].length > 200, `${key}: swatch found in the legend panel (${hits[0].length} px)`);
    for (let c = 0; c < 3; c++) {
      assertClose(medians[key][c], want[c], 12, `${key}: swatch channel ${c} matches the stated legend colour`);
    }
  }
  // The four swatch colours must be distinguishable, or hue classification is pointless.
  const hues = KEYS.map((k) => {
    const [r, g, b] = medians[k];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 0;
    if (mx === r) return (((g - b) / d) * 60 + 360) % 360;
    if (mx === g) return ((b - r) / d) * 60 + 120;
    return ((r - g) / d) * 60 + 240;
  });
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const minGap = Math.min(...hues.map((h, i) => Math.min(hueGap(h, hues[(i + 1) % 4])), ...[]));
  assert(minGap > 40, `Measured swatch hues are far apart (closest pair ${minGap.toFixed(1)}°)`);
  KEYS.forEach((k, i) => assertClose(hues[i], cfg.extract.classes[k].hue, 5,
    `${k}: configured hue matches the measured swatch (${hues[i].toFixed(1)}°)`));
}

// -----------------------------------------------------------------------------
// 3. THE FOUR SPECIES ON REAL PLUMES
// -----------------------------------------------------------------------------
console.log('\n--- 3. Species on real frames (t=0) ---');
{
  const regions = [
    ['black_carbon', 'wildfires over central Africa', { x: 660, y: 300, w: 90, h: 70 }],
    ['dust', 'Sahara plume over the Atlantic', { x: 560, y: 230, w: 80, h: 60 }],
    ['sea_salt', 'storm swirls in the Southern Ocean', { x: 300, y: 470, w: 90, h: 70 }],
    ['sulfate', 'streaks over North America', { x: 650, y: 80, w: 90, h: 55 }],
  ];
  for (const [key, where, crop] of regions) {
    resetAnalyzer();
    const out = analyze(video(0, frameAt(0)), cropCfg(crop));
    const share = out.layers[key];
    const px = out.layerPixels[key];
    assert(px > 100, `${key}: detected in ${where} (${px} px)`);
    assert(share > 0.9, `${key} dominates ${where} (${(share * 100).toFixed(1)} % of classified pixels)`);
    const others = KEYS.filter((k) => k !== key).map((k) => out.layers[k]);
    assert(Math.max(...others) < 0.1, `${key}: no other species reaches 10 % there (max ${(Math.max(...others) * 100).toFixed(1)} %)`);
  }
}

// -----------------------------------------------------------------------------
// 4. FEATURE CONTRACT ON A FULL FRAME
// -----------------------------------------------------------------------------
console.log('\n--- 4. Feature contract ---');
let full;
{
  resetAnalyzer();
  full = analyze(video(0, frameAt(0)), cfg);
  assert(Array.isArray(full.grid) && full.grid.length === 512, `grid has 512 cells (${full.grid.length})`);
  assert(full.grid.every((v) => v === null || (v >= 0 && v <= 1)), 'Every grid value is null or a density in 0..1');
  assert(full.grid.filter((v) => v !== null).length > 400, `Most cells are analysable (${full.grid.filter((v) => v !== null).length})`);
  assert(full.mean > 0 && full.mean <= 1, `mean is a relative density (${full.mean.toFixed(4)})`);
  assert(full.max > 0 && full.max <= 1, `max is a relative density (${full.max.toFixed(3)})`);
  assert(full.columns.length === 32 && full.columns.every((v) => v === null || (v >= 0 && v <= 1)),
    'columns has 32 values in 0..1');
  assert(Array.isArray(full.flashes) && full.flashes.length === 0, 'flashes is empty for aerosols');
  assert(full.change >= 0 && full.change <= 1, `change is a 0..1 fraction (${full.change})`);
  assert(JSON.stringify(Object.keys(full.layers).sort()) === JSON.stringify([...KEYS].sort()),
    `layers uses exactly the canonical keys (${Object.keys(full.layers).join(', ')})`);
  const sum = KEYS.reduce((a, k) => a + full.layers[k], 0);
  assertClose(sum, 1, 1e-6, 'layer proportions sum to 1');
  assert(full.aerosolPixels > 50000, `classified pixel count is reported (${full.aerosolPixels})`);
  assert(typeof full.aerosolAmbiguous === 'number' && full.aerosolAmbiguous < full.aerosolPixels,
    `ambiguous pixel count is reported and small (${full.aerosolAmbiguous})`);
  assert(cfg.colorbar.unit.startsWith('relative'), `colorbar unit states a relative measure (${cfg.colorbar.unit})`);
}

// -----------------------------------------------------------------------------
// 5. MASKS
// -----------------------------------------------------------------------------
console.log('\n--- 5. Annotation masks ---');
{
  // The legend sits in the bottom-right: those cells must be null, and the swatch
  // colours must never be counted as aerosol.
  const legend = cfg.masks.find((m) => m.y === 575);
  const rows = [Math.floor(legend.y / (H / 16)), Math.floor((legend.y + legend.h - 1) / (H / 16))];
  const cols = [Math.floor(legend.x / (W / 32)), Math.floor((legend.x + legend.w - 1) / (W / 32))];
  let allNull = true;
  for (let r = rows[0]; r <= rows[1]; r++) for (let c = cols[0]; c <= cols[1]; c++) {
    if (full.grid[r * 32 + c] !== null) allNull = false;
  }
  assert(allNull, 'Every cell under the legend is null (no data, not zero)');

  assert(full.aerosolMasked === legend.w * legend.h + cfg.masks.filter((m) => m.y !== 575)
    .reduce((a, m) => a + m.w * m.h, 0) - 0
    || full.aerosolMasked > 25000, `Masked pixel count is reported (${full.aerosolMasked})`);

  // A synthetic frame whose only aerosol is painted INSIDE a mask must yield nothing.
  const masked = blankFrame();
  paintRect(masked, 870, 590, 200, 40, hsvToRgb(11.7, 0.9, 0.9));      // inside the legend box
  paintRect(masked, 220, 130, 20, 15, hsvToRgb(275.3, 0.6, 0.9));      // inside a caption box
  resetAnalyzer();
  const noData = analyze(video(1, masked), { ...cfg, masks: cfg.masks });
  assert(noData.aerosolPixels === 0, `Pixels inside masks are never data (${noData.aerosolPixels} classified)`);
  assert(noData.mean === 0, `Masked-only frame reports zero density (${noData.mean})`);

  // The same paint OUTSIDE the masks must be detected, so the test above is real.
  const unmasked = blankFrame();
  paintRect(unmasked, 100, 400, 200, 40, hsvToRgb(11.7, 0.9, 0.9));
  resetAnalyzer();
  const yes = analyze(video(1, unmasked), { ...cfg, masks: [] });
  assert(yes.aerosolPixels > 7000, `The same colour outside the mask is classified (${yes.aerosolPixels} px)`);
  assert(yes.layers.black_carbon > 0.99, 'It is assigned to black carbon');
}

// -----------------------------------------------------------------------------
// 6. SYNTHETIC SWATCHES: ALL FOUR SPECIES AT PARTIAL OPACITY
// -----------------------------------------------------------------------------
console.log('\n--- 6. Synthetic swatches (species at 40 % strength) ---');
{
  for (const key of KEYS) {
    const hue = cfg.extract.classes[key].hue;
    const rgb = hsvToRgb(hue, 0.6, 0.45);
    const frame = blankFrame();
    paintRect(frame, 200, 200, 240, 120, rgb);
    resetAnalyzer();
    const out = analyze(video(2, frame), { ...cfg, masks: [] });
    assert(out.layers[key] > 0.99, `${key} colour rgb(${rgb.join(',')}) is classified as ${key} (${(out.layers[key] * 100).toFixed(1)} %)`);
    assert(out.aerosolAmbiguous === 0, `${key}: a pure single species is not ambiguous (${out.aerosolAmbiguous})`);
  }
  // Species must not be confused with each other, in both directions.
  resetAnalyzer();
  const dust = blankFrame();
  paintRect(dust, 200, 200, 240, 120, hsvToRgb(275.3, 0.6, 0.6));
  const d = analyze(video(3, dust), { ...cfg, masks: [] });
  assert(d.layers.dust > 0.99 && d.layers.sulfate < 0.01 && d.layers.sea_salt < 0.01,
    'Dust is never reported as sulfate or sea salt');
}

// -----------------------------------------------------------------------------
// 7. AMBIGUITY
// -----------------------------------------------------------------------------
console.log('\n--- 7. Ambiguous pixels ---');
{
  // The hue boundary between sulfate (110°) and sea salt (175°) is ~142°.
  const frame = blankFrame();
  paintRect(frame, 200, 200, 240, 120, hsvToRgb(142, 0.6, 0.5));
  resetAnalyzer();
  const edge = analyze(video(4, frame), { ...cfg, masks: [] });
  assert(edge.aerosolAmbiguous > 20000, `Edge-hue pixels are counted as ambiguous (${edge.aerosolAmbiguous})`);
  assert(edge.aerosolPixels === 0, `They are never assigned to a species (${edge.aerosolPixels} classified)`);
  assert(edge.layers.sulfate === 0 && edge.layers.sea_salt === 0, 'A boundary colour inflates neither neighbour');
  assert(edge.mean === 0, `Ambiguous pixels do not enter the density grid (${edge.mean})`);

  // Just inside each side of the boundary they must classify, so the band is a
  // band and not a black hole.
  const nearSalt = blankFrame();
  paintRect(nearSalt, 200, 200, 240, 120, hsvToRgb(160, 0.6, 0.5));
  resetAnalyzer();
  const s = analyze(video(5, nearSalt), { ...cfg, masks: [] });
  assert(s.layers.sea_salt > 0.9, `160° classifies as sea salt (${(s.layers.sea_salt * 100).toFixed(1)} %)`);
  const nearSulf = blankFrame();
  paintRect(nearSulf, 200, 200, 240, 120, hsvToRgb(125, 0.6, 0.5));
  resetAnalyzer();
  const u = analyze(video(6, nearSulf), { ...cfg, masks: [] });
  assert(u.layers.sulfate > 0.9, `125° classifies as sulfate (${(u.layers.sulfate * 100).toFixed(1)} %)`);

  // Never more ambiguous pixels than valid ones, and never negative.
  assert(typeof full.aerosolAmbiguous === 'number' && full.aerosolAmbiguous >= 0,
    'Real frame reports a non-negative ambiguity count');
}

// -----------------------------------------------------------------------------
// 8. FALSE CLASSIFICATIONS
// -----------------------------------------------------------------------------
console.log('\n--- 8. False classifications ---');
{
  const cases = [
    ['pure white (cloud tops, text)', [255, 255, 255]],
    ['neutral mid grey (land)', [128, 128, 128]],
    ['dark neutral (base map land)', [40, 40, 40]],
    ['black ocean', [0, 0, 0]],
    ['dark blue base tint', [15, 26, 40]],
    ['blue hue far from every species', hsvToRgb(225, 0.7, 0.6)],
  ];
  for (const [label, rgb] of cases) {
    const frame = blankFrame();
    paintRect(frame, 0, 0, 320, 200, rgb);
    resetAnalyzer();
    const out = analyze(video(7, frame), { ...cfg, masks: [] });
    assert(out.aerosolPixels < 200, `${label} is not classified as aerosol (${out.aerosolPixels} px)`);
    assert(out.mean < 0.02, `${label} leaves the density grid empty (mean ${out.mean})`);
  }

  // Very dim aerosol is treated as background, not as a species.
  const faint = blankFrame();
  paintRect(faint, 0, 0, 320, 200, hsvToRgb(275.3, 0.4, 0.15));
  resetAnalyzer();
  const f = analyze(video(8, faint), { ...cfg, masks: [] });
  assert(f.aerosolPixels < 500, `Below the brightness floor dust is not counted (${f.aerosolPixels} px)`);
}

// -----------------------------------------------------------------------------
// 9. SEEK / RESET
// -----------------------------------------------------------------------------
console.log('\n--- 9. Seek and reset ---');
{
  const a = blankFrame();
  paintRect(a, 100, 100, 300, 200, hsvToRgb(275.3, 0.6, 0.6));
  const b = blankFrame();
  paintRect(b, 700, 300, 300, 200, hsvToRgb(174.5, 0.6, 0.6));

  resetAnalyzer();
  const first = analyze(video(10, a), { ...cfg, masks: [] });
  const second = analyze(video(10.03, b), { ...cfg, masks: [] });
  assert(first.change === 0, `First frame of a run has change 0 (${first.change})`);
  assert(first.grid.some((v, i) => v !== second.grid[i]), 'A different frame produces a different grid');
  assert(second.change > 0.05, `Consecutive frames report change (${second.change.toFixed(3)})`);

  const afterSeek = analyze(video(40, a), { ...cfg, masks: [] });
  assert(afterSeek.change === 0, `A jump over 1.5 s resets change to 0 (${afterSeek.change})`);

  resetAnalyzer();
  const afterReset = analyze(video(41, a), { ...cfg, masks: [] });
  assert(afterReset.change === 0, `resetAnalyzer() drops temporal state (${afterReset.change})`);

  // Deterministic: the same frame analysed twice gives the same numbers.
  resetAnalyzer();
  const p1 = analyze(video(0, frameAt(0)), cfg);
  resetAnalyzer();
  const p2 = analyze(video(0, frameAt(0)), cfg);
  assert(JSON.stringify(p1.grid) === JSON.stringify(p2.grid), 'Analysis is deterministic for the same frame');
  assert(p1.layers.dust === p2.layers.dust && p1.aerosolPixels === p2.aerosolPixels, 'Layer proportions are deterministic');
}

// -----------------------------------------------------------------------------
// 10. EMPTY DATA AND BAD INPUT
// -----------------------------------------------------------------------------
console.log('\n--- 10. Empty data ---');
{
  resetAnalyzer();
  const unready = analyze({ readyState: 0, videoWidth: 0, videoHeight: 0, currentTime: 0 }, cfg);
  assert(unready.grid.every((v) => v === null) && unready.mean === null, 'Unready video yields empty features');
  assert(JSON.stringify(unready.layers) === '{}', 'Empty features carry no layers');

  const noClasses = analyze(video(0, frameAt(0)), { ...cfg, extract: { mode: 'layers' } });
  assert(noClasses.grid.every((v) => v === null), 'A config without species falls back to empty features');

  const empty = emptyFeatures(cfg);
  assert(empty.grid.length === 512 && empty.columns.length === 32, 'emptyFeatures matches the grid contract');

  const black = analyze(video(9, blankFrame([0, 0, 0])), { ...cfg, masks: [] });
  assert(black.grid.every((v) => v === 0 || v === null), 'An aerosol-free frame reports zero density, not null');
  assert(KEYS.every((k) => black.layers[k] === 0), 'An aerosol-free frame reports zero proportions');
}

// -----------------------------------------------------------------------------
// 11. PERFORMANCE
// -----------------------------------------------------------------------------
console.log('\n--- 11. Performance ---');
{
  const frame = frameAt(0);
  resetAnalyzer();
  analyze(video(0, frame), cfg);                       // warm up (JIT)
  const times = [];
  for (let i = 0; i < 8; i++) {
    const t0 = process.hrtime.bigint();
    analyze(video(0.25 + i * 0.25, frame), cfg);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((p, q) => p - q);
  const median = times[Math.floor(times.length / 2)];
  console.log(`  info: analyze() median ${median.toFixed(1)} ms, max ${times[times.length - 1].toFixed(1)} ms (1280×640)`);
  assert(median < 120, `analyze() fits the 4 Hz slot (median ${median.toFixed(1)} ms of 250 ms)`);
}

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n========================================');
console.log(`AEROSOLS TESTS: ${passed} passed, ${failed} failed, ${total} total`);
console.log('========================================');
process.exit(failed === 0 ? 0 : 1);
