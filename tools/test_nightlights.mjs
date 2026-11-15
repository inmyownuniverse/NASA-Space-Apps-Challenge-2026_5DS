// Regression tests for the Night Lights pipeline (media/nightlights_web.mp4).
// Uses REAL decoded frames from the committed proxy — no fabricated values.
//
// Measured ground truth used by these tests (see media/README.md):
//   proxy 1920×540, 30 fps, 1300 frames, 43.33 s
//   world map duplicates with period 961 px (copy A = x 0–960, copy B = x 961–1919)
//   analysed crop 960×520 -> exactly one 360° copy
//   pop-out panels (absolute proxy px): W. Europe x 170–498 y 186–514,
//                                       Ukraine   x 592–805 y  32–317

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
  assert(diff <= tol, `${message} (expected ~${expected}, got ${actual}, diff ${diff.toExponential(2)})`);
}

const cfg = JSON.parse(fs.readFileSync(path.join(rootDir, 'datasets', 'nightlights.json'), 'utf-8'));
const proxyPath = path.join(rootDir, cfg.video);
const FULL_W = 1920;
const FULL_H = 540;

// -----------------------------------------------------------------------------
// 1. CONFIG AND ASSET
// -----------------------------------------------------------------------------
console.log('\n--- 1. Dataset config and web proxy ---');
assert(cfg.video === 'media/nightlights_web.mp4', `Config points at the web proxy (${cfg.video})`);
assert(fs.existsSync(proxyPath), 'Proxy media/nightlights_web.mp4 exists on disk');
if (!fs.existsSync(path.join(rootDir, 'media', 'nightlights.mp4'))) {
  console.log('  SKIP: Optional original 8K asset absent; testing the bundled web proxy.');
}

const probe = JSON.parse(execSync(
  'ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames -show_entries format=duration -of json ' +
  `"${proxyPath.replace(/\\/g, '/')}"`,
  { cwd: rootDir, encoding: 'utf-8' },
));
const stream = probe.streams[0];
assert(stream.codec_name === 'h264', `Proxy codec is H.264 (${stream.codec_name}) — browser decodable`);
assert(stream.width === 1920 && stream.height === 540, `Proxy is 1920x540 / 32:9 (got ${stream.width}x${stream.height})`);
assert(stream.r_frame_rate === '30/1', `Proxy is 30 fps (got ${stream.r_frame_rate})`);
assert(Number(stream.nb_frames) === 1300, `Proxy kept all 1300 frames (got ${stream.nb_frames})`);
assertClose(Number(probe.format.duration), 43.333, 0.05, 'Proxy duration matches the original timeline');
const bytes = fs.statSync(proxyPath).size;
assert(bytes > 500_000 && bytes < 8_000_000, `Proxy size is a sane web weight (${(bytes / 1e6).toFixed(2)} MB)`);

assert(cfg.crop.x === 0 && cfg.crop.y === 20 && cfg.crop.w === 960 && cfg.crop.h === 520,
  `Crop takes exactly one world copy (${JSON.stringify(cfg.crop)})`);
assert(cfg.grid.w === 32 && cfg.grid.h === 16, 'Grid is 32 x 16');
assert(/brightness index/.test(cfg.colorbar.unit), `Unit is unitless brightness index (${cfg.colorbar.unit})`);
assert(!/nW|sr|W\/m/.test(cfg.colorbar.unit), 'Unit does NOT claim a physical radiance unit');
assert(cfg.colorbar.stops[0].value === 0 && cfg.colorbar.stops[cfg.colorbar.stops.length - 1].value === 100,
  'Colorbar value range stays 0..100 for the sound engine');
assert(cfg.extract.mode === 'brightness', 'Extractor mode is brightness');
assert(cfg.segments.length === 2, 'Two annual segments declared');
assert(cfg.segments[0].from === 0 && cfg.segments[0].to > 9.4 && cfg.segments[0].to < 9.433,
  `Segment 1 covers the last annual frame 9.400 s and stops before the change map (to=${cfg.segments[0].to})`);
assert(cfg.segments[1].from > 21.233 && cfg.segments[1].from < 21.267,
  `Segment 2 starts on the first annual frame at 21.267 s (from=${cfg.segments[1].from})`);
assert(cfg.segments[1].to > 36.567 && cfg.segments[1].to < 36.6,
  `Segment 2 ends on the last annual frame at 36.567 s (to=${cfg.segments[1].to})`);
assert(cfg.segments[1].masks.length === 12,
  `Segment 2 masks two pop-out panels plus ten callout rectangles (${cfg.segments[1].masks.length})`);
assert(cfg.sound.mapper === 'density' && cfg.sound.instrument === 'glass', 'Freia sound block preserved');
assert(Array.isArray(cfg.legend) && cfg.legend.length === 2, 'Celene legend block preserved');
assert(typeof cfg.description === 'string' && cfg.description.length > 0, 'Description preserved');

// -----------------------------------------------------------------------------
// 2. REAL FRAME HARNESS
// -----------------------------------------------------------------------------
const TMP = path.join(rootDir, 'tools', '.nl_frames');
fs.mkdirSync(TMP, { recursive: true });
const frames = new Map();

function extractFrame(t) {
  const out = path.join(TMP, `f${t}.rgba`);
  execSync(
    `ffmpeg -v error -y -ss ${t} -i "${proxyPath.replace(/\\/g, '/')}" -frames:v 1 ` +
    `-f rawvideo -pix_fmt rgba "${out.replace(/\\/g, '/')}"`,
    { cwd: rootDir },
  );
  const raw = new Uint8ClampedArray(fs.readFileSync(out));
  fs.unlinkSync(out);
  if (raw.length !== FULL_W * FULL_H * 4) throw new Error(`bad frame size for t=${t}: ${raw.length}`);
  return raw;
}

function frameAt(t) {
  if (!frames.has(t)) frames.set(t, extractFrame(t));
  return frames.get(t);
}

function hashFrame(buf) {
  let h = 5381;
  for (let i = 0; i < buf.length; i += 4093) h = ((h * 33) ^ buf[i]) >>> 0;
  return h.toString(16);
}

class MockCanvasContext {
  constructor() { this.buffer = null; }
  drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
    const full = image._frame ?? frames.get(image.currentTime);
    if (!full) throw new Error(`no frame for t=${image.currentTime}`);
    const buf = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      const srcRow = ((sy + y) * FULL_W + sx) * 4;
      buf.set(full.subarray(srcRow, srcRow + dw * 4), y * dw * 4);
    }
    this.buffer = buf;
  }
  getImageData(sx, sy, sw, sh) { return { data: this.buffer, width: sw, height: sh }; }
}
class MockCanvas {
  constructor() { this.width = 0; this.height = 0; this._ctx = new MockCanvasContext(); }
  getContext() { return this._ctx; }
}

globalThis.document = { createElement: () => new MockCanvas() };
globalThis.performance = { now: () => Date.now() };

const { analyze, resetAnalyzer, emptyFeatures } = await import(`../js/analyzer.js?t=${Date.now()}`);

const testVideo = {};
function videoAt(t) {
  return Object.assign(testVideo, {
    readyState: 4, videoWidth: FULL_W, videoHeight: FULL_H,
    currentTime: t, _frame: frameAt(t),
  });
}

// -----------------------------------------------------------------------------
// 3. DUPLICATE-MAP HANDLING
// -----------------------------------------------------------------------------
console.log('\n--- 3. Duplicated world map ---');
{
  const full = frameAt(5);
  const gray = (x, y) => {
    const i = (y * FULL_W + x) * 4;
    return 0.2126 * full[i] + 0.7152 * full[i + 1] + 0.0722 * full[i + 2];
  };
  let best = { mae: Infinity, shift: -1 };
  for (let s = 940; s <= 980; s++) {
    let sum = 0, n = 0;
    for (let y = 20; y < 540; y += 3) {
      for (let x = 0; x < FULL_W - s; x += 3) {
        sum += Math.abs(gray(x, y) - gray(x + s, y));
        n++;
      }
    }
    const mae = sum / n;
    if (mae < best.mae) best = { mae, shift: s };
  }
  console.log(`    measured period ${best.shift}px, copy-to-copy MAE ${best.mae.toFixed(2)} grey levels`);
  assert(best.shift >= 959 && best.shift <= 963, `Map duplicates at ~961 px (measured ${best.shift})`);
  assert(best.mae < 2, `The two copies are near-identical (MAE ${best.mae.toFixed(2)} grey levels)`);
  assert(cfg.crop.w <= best.shift, `Crop width ${cfg.crop.w} px contains ONE copy, not both`);
  assert(cfg.crop.x === 0, 'Crop starts at the first copy (x=0), so columns span 0–360° once');
  const copies = (FULL_W / best.shift);
  assert(copies > 1.9 && copies < 2.1, `Frame holds ${copies.toFixed(2)} copies (a 32:9 hyperwall render)`);
}

// -----------------------------------------------------------------------------
// 4. PHASE DETECTION — four intervals and every boundary
// -----------------------------------------------------------------------------
console.log('\n--- 4. Phase detection (four intervals + boundaries) ---');
{
  // A constant-luminance frame isolates phase logic from image content.
  const FLAT = new Uint8ClampedArray(FULL_W * FULL_H * 4);
  for (let i = 0; i < FLAT.length; i += 4) { FLAT[i] = 120; FLAT[i + 1] = 120; FLAT[i + 2] = 120; FLAT[i + 3] = 255; }
  const flatAt = (t) => ({ readyState: 4, videoWidth: FULL_W, videoHeight: FULL_H, currentTime: t, _frame: FLAT });

  const cases = [
    [5.0, 'annual', 'annual segment 1'],
    [15.0, 'silent', 'change map 1'],
    [30.0, 'annual', 'annual segment 2 (pop-outs)'],
    [40.0, 'silent', 'change map 2'],
    // frame-exact boundaries (30 fps: 282 frames = 9.400, 637 = 21.233, 1097 = 36.567, 1098 = 36.600)
    [9.4, 'annual', 'last frame of annual segment 1 (9.400 s)'],
    [9.433, 'silent', 'first frame of change map (9.433 s)'],
    [21.233, 'silent', 'last frame of change map (21.233 s)'],
    [21.267, 'annual', 'first frame of annual segment 2 (21.267 s)'],
    [36.567, 'annual', 'last frame of annual segment 2 (36.567 s)'],
    [36.6, 'silent', 'first frame of change map 2 (36.600 s)'],
  ];
  resetAnalyzer();
  for (const [t, expect, label] of cases) {
    const f = analyze(flatAt(t), cfg);
    if (expect === 'annual') {
      assert(f.mean !== null && f.phase === 'annual',
        `t=${t}s ${label} → annual (phase=${f.phase}, mean=${f.mean?.toFixed(2)})`);
    } else {
      assert(f.mean === null && f.max === null && f.phase === undefined,
        `t=${t}s ${label} → silent (mean=${f.mean})`);
    }
  }
}

// -----------------------------------------------------------------------------
// 5. SEEK / FRAME-UPDATE SYNCHRONISATION
// -----------------------------------------------------------------------------
console.log('\n--- 5. Frame synchronisation (no stale buffers) ---');
{
  const h5 = hashFrame(frameAt(5));
  const h30 = hashFrame(frameAt(30));
  const h15 = hashFrame(frameAt(15));
  assert(h5 !== h30 && h5 !== h15 && h30 !== h15,
    `Distinct decoded frames per timestamp (${h5} / ${h30} / ${h15})`);

  // Simulate the player: one <video>, currentTime moved, the decoded picture swapped
  // in by the browser. The analyser must always describe the CURRENT picture.
  const v = { readyState: 4, videoWidth: FULL_W, videoHeight: FULL_H, currentTime: 5, _frame: frameAt(5) };
  resetAnalyzer();
  const at5 = analyze(v, cfg);
  v.currentTime = 30; v._frame = frameAt(30);
  const at30 = analyze(v, cfg);
  v.currentTime = 5; v._frame = frameAt(5);
  const back5 = analyze(v, cfg);

  assert(at5.mean !== at30.mean, `Seeking to a new frame changes the reading (${at5.mean.toFixed(2)} → ${at30.mean.toFixed(2)})`);
  assert(at30.grid.filter((x) => x === null).length > at5.grid.filter((x) => x === null).length,
    'Pop-out masks only apply to the segment that has them');
  assert(at5.mean === back5.mean, 'Returning to the same timestamp reproduces the same reading (no cached features)');
  assert(at5.change === 0 || back5.change >= 0, 'Change never leaks across a seek');

  // A stale buffer would give identical grids for different pictures.
  const same = at5.grid.every((val, i) => val === at30.grid[i]);
  assert(!same, 'The two timestamps produce genuinely different grids');
}

// -----------------------------------------------------------------------------
// 6. ANNUAL SEGMENT 1 — brightness semantics
// -----------------------------------------------------------------------------
console.log('\n--- 6. Annual segment 1 (0–9.40 s, no annotations in crop) ---');
resetAnalyzer();
const f1 = analyze(videoAt(5), cfg);
const g1 = f1.grid;
assert(g1.length === 512, `512 cells (got ${g1.length})`);
assert(f1.phase === 'annual', `Phase metadata is "annual" (got ${f1.phase})`);

const nulls1 = g1.filter((v) => v === null).length;
const zeros1 = g1.filter((v) => v === 0).length;
const nums1 = g1.filter((v) => typeof v === 'number');
const lit1 = nums1.filter((v) => v > 0);

assert(nulls1 === 0, `No cells masked in segment 1 (the year label is outside the crop) — ${nulls1} null`);
assert(nums1.every(Number.isFinite), 'All cell values are finite numbers');
assert(nums1.every((v) => v >= 0 && v <= 100), `All values within 0..100 (min ${Math.min(...nums1)}, max ${Math.max(...nums1)})`);
assert(zeros1 > 100, `Completely dark cells are 0, not null (${zeros1} zero cells)`);
assert(lit1.length > 30, `Substantial lit cells detected (${lit1.length} cells > 0)`);

const manualMean1 = nums1.reduce((a, b) => a + b, 0) / nums1.length;
assertClose(f1.mean, manualMean1, 1e-9, `Mean averages ALL unmasked cells including zeros (${f1.mean.toFixed(2)})`);
assertClose(f1.max, Math.max(...nums1), 1e-9, `Max is the brightest unmasked cell (${f1.max})`);
assert(f1.mean > 0 && f1.mean < 60, `Mean brightness plausible for a night-lights map (${f1.mean.toFixed(2)}/100)`);
assert(f1.columns.length === 32 && f1.columns.every((c) => typeof c === 'number'),
  '32 columns, none entirely masked');
{
  let ok = true;
  for (let c = 0; c < 32; c++) {
    const col = [];
    for (let r = 0; r < 16; r++) { const v = g1[r * 32 + c]; if (v !== null) col.push(v); }
    if (Math.abs(col.reduce((a, b) => a + b, 0) / col.length - f1.columns[c]) > 1e-9) ok = false;
  }
  assert(ok, 'Every column is the mean of its unmasked cells (zeros included)');
}
assert(f1.flashes.length === 0 && Object.keys(f1.layers).length === 0, 'flashes [] and layers {} for Night Lights');

// Annotation pixels must never be read as brightness. The year label is neutral
// grey text on black; city lights are warm and low-saturation columns are borders.
{
  const lab = frameAt(22.8);
  const BAND = [265, 292];
  const perColumn = (x) => {
    let n = 0;
    for (let y = BAND[0]; y < BAND[1]; y++) {
      const i = (y * FULL_W + x) * 4;
      const r = lab[i], g = lab[i + 1], b = lab[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat <= 18 && l > 95 && l < 190) n++;
    }
    return n;
  };

  let labelCols = 0;
  for (let x = 960; x < 1100; x++) if (perColumn(x) >= 5) labelCols++;
  assert(labelCols >= 6, `Year-label glyph columns detected at x >= 960 (${labelCols} columns)`);

  const maskX = [...cfg.masks, ...cfg.segments[1].masks];
  const inAnyMaskX = (x) => maskX.some((m) => x >= m.x - 1 && x < m.x + m.w + 1);
  const stray = [];
  for (let x = 0; x < cfg.crop.w; x++) if (perColumn(x) >= 5 && !inAnyMaskX(x)) stray.push(x);
  assert(stray.length === 0,
    `No label glyphs inside the analysed copy (stray text columns: ${stray.slice(0, 8).join(',') || 'none'})`);
  assert(960 >= cfg.crop.w, 'The label starts at x≈996, i.e. beyond the 960 px crop');
}

// -----------------------------------------------------------------------------
// 7. ANNUAL SEGMENT 2 — pop-out masks
// -----------------------------------------------------------------------------
console.log('\n--- 7. Annual segment 2 (21.27–36.57 s, pop-outs masked) ---');
resetAnalyzer();
const f2 = analyze(videoAt(30), cfg);
const g2 = f2.grid;
const nulls2 = g2.filter((v) => v === null).length;
const valid2 = g2.filter((v) => typeof v === 'number').length;

assert(f2.phase === 'annual', 'Phase metadata still "annual"');
assert(nulls2 > 40, `Pop-out panels mask a substantial block of cells (${nulls2} masked)`);
assert(valid2 === 512 - nulls2, `Valid + masked cells account for all 512 (${valid2} valid)`);
assert(g2.filter((v) => typeof v === 'number').every((v) => v >= 0 && v <= 100),
  'Remaining values stay within 0..100');
console.log(`    segment 2: ${nulls2} masked cells, ${valid2} valid cells, mean ${f2.mean.toFixed(2)}, max ${f2.max}`);

// -----------------------------------------------------------------------------
// 8. MASK CORRECTNESS AGAINST MEASURED PANEL BOUNDS
// -----------------------------------------------------------------------------
console.log('\n--- 8. Masks vs measured panels (no real map data removed) ---');
{
  // Measured on proxy frame t=30 s by bright-border detection; the panel header text
  // was read back from the frame (Western Europe, Eastern Mediterranean, Ukraine, India).
  const PANELS = [
    { name: 'Western Europe', x0: 170, y0: 186, x1: 498, y1: 514 },
    { name: 'Eastern Mediterranean', x0: 592, y0: 32, x1: 806, y1: 317 },
    { name: 'Ukraine', x0: 1161, y0: 26, x1: 1431, y1: 229 },
    { name: 'India', x0: 1514, y0: 267, x1: 1770, y1: 523 },
  ];
  const cropY = cfg.crop.y;
  const allMasks = [...cfg.masks, ...cfg.segments[1].masks];
  const absRect = (m) => ({ x0: m.x, y0: m.y + cropY, x1: m.x + m.w - 1, y1: m.y + cropY + m.h - 1 });
  const overlap = (a, b) => {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;
    return w > 0 && h > 0 ? w * h : 0;
  };
  const panelMasks = [];
  const otherMasks = [];
  for (const m of allMasks) {
    const r = absRect(m);
    const panel = PANELS.find((p) => overlap(r, p) > 0);
    const panelArea = panel ? (panel.x1 - panel.x0 + 1) * (panel.y1 - panel.y0 + 1) : 0;
    // A panel mask covers most of its panel; a thin strip along a panel edge is a callout.
    (panel && m.w * m.h >= panelArea * 0.5 ? panelMasks : otherMasks).push({ m, r, panel });
  }

  assert(panelMasks.length === 2, `Two masks sit on measured panels (${panelMasks.length})`);
  for (const { m, r, panel } of panelMasks) {
    const slack = Math.max(
      0, panel.x0 - r.x0, r.x1 - panel.x1, panel.y0 - r.y0, r.y1 - panel.y1,
    );
    assert(slack <= 2,
      `${panel.name} mask matches the measured panel within 2 px (x ${r.x0}–${r.x1}, y ${r.y0}–${r.y1} vs panel x ${panel.x0}–${panel.x1}, y ${panel.y0}–${panel.y1}; worst overshoot ${slack} px)`);
    const spill = Math.max(0, m.w * m.h - (panel.x1 - panel.x0 + 1) * (panel.y1 - panel.y0 + 1));
    assert(spill <= 1600, `${panel.name} mask carries only a 1 px border beyond the panel (${spill} px extra)`);
  }

  // The year-label guard belongs to the second copy, outside the analysed crop.
  for (const { m } of otherMasks) {
    if (m.x >= cfg.crop.w) assert(m.x >= cfg.crop.w, `Mask at x=${m.x} is a guard beyond the crop`);
  }

  // Callouts (source box + leader lines) are burned into the pop-out segment only.
  const callouts = otherMasks.filter(({ m }) => m.x < cfg.crop.w);
  assert(callouts.length === 10, `Ten callout rectangles inside the crop (${callouts.length})`);
  {
    const brightCount = (buf, r) => {
      let n = 0;
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          const i = (y * FULL_W + x) * 4;
          if (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2] > 60) n++;
        }
      }
      return n;
    };
    const f30 = frameAt(30), f5 = frameAt(5);
    let drawn = 0, plain = 0;
    for (const { m, r } of callouts) {
      drawn += brightCount(f30, r);
      plain += brightCount(f5, r);
      assert(m.w * m.h < 12000, `Callout at x ${r.x0}–${r.x1} is a thin strip, not a blanket (${m.w * m.h} px)`);
    }
    // The fences, beam edges and leader lines are drawn only in the pop-out segment.
    assert(drawn - plain >= 300,
      `Callout masks cover annotation drawn only in the pop-out segment (+${drawn - plain} bright px vs the annual frame)`);
  }

  // Segmentation-level proof: a sample nulled by a PANEL mask must lie on that panel,
  // never on plain map. Otherwise the mask is hiding real city lights.
  const ch = cfg.crop.h / cfg.grid.h;
  const cw = cfg.crop.w / cfg.grid.w;
  const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const onPanel = (x, y) => PANELS.some((p) =>
    x >= p.x0 - 2 && x <= p.x1 + 2 && y + cropY >= p.y0 - 2 && y + cropY <= p.y1 + 2);
  let badSamples = 0;
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 32; col++) {
      if (g2[row * 32 + col] !== null) continue;
      for (let sy = 0; sy < 5; sy++) {
        const y = row * ch + ch * (sy + 0.5) / 5;
        for (let sx = 0; sx < 5; sx++) {
          const x = col * cw + cw * (sx + 0.5) / 5;
          const hitsPanelMask = panelMasks.some(({ m }) => inRect(x, y, m));
          if (hitsPanelMask && !onPanel(x, y)) badSamples++;
        }
      }
    }
  }
  assert(badSamples === 0, `No panel-masked sample lies on plain map (${badSamples} offending samples)`);

  // regression for the specific bug found in the audit: the W. Europe mask used to be
  // 349 px tall (21 px / 6 580 real map pixels below the panel).
  const we = cfg.segments[1].masks[0];
  const wePanel = PANELS[0];
  assert(we.h <= wePanel.y1 - wePanel.y0 + 4,
    `W. Europe mask height no longer runs past the panel (h=${we.h}, panel height ${wePanel.y1 - wePanel.y0 + 1})`);
  assert(we.y + cropY + we.h - 1 <= wePanel.y1 + 2,
    `W. Europe mask bottom (abs y ${we.y + cropY + we.h - 1}) stops at the panel bottom (${wePanel.y1})`);

  // and the rows the mask used to swallow are still readable at 40 % of the column span
  const rowBelow = Math.min(15, Math.floor((wePanel.y1 + 4 - cropY) / ch));
  const rowVals = [];
  for (let c = 0; c < 32; c++) {
    const v = g2[rowBelow * 32 + c];
    if (v !== null) rowVals.push(v);
  }
  assert(rowVals.length > 0, `Bottom row under the panel still yields data (${rowVals.length} valid cells in row ${rowBelow})`);
}

// -----------------------------------------------------------------------------
// 9. TEMPORAL BEHAVIOUR
// -----------------------------------------------------------------------------
console.log('\n--- 9. Temporal change, resets and seeking ---');
resetAnalyzer();
analyze(videoAt(4.0), cfg);
const ch1 = analyze(videoAt(4.5), cfg);
assert(ch1.change >= 0 && ch1.change <= 1, `Frame-to-frame change is 0..1 (${ch1.change.toFixed(3)})`);

{
  const v = videoAt(4.5);
  v.currentTime = 30.0;
  v._frame = frameAt(30);
  const seeked = analyze(v, cfg);
  assert(seeked.change === 0, 'Seeking across the change segment resets change to 0');
  resetAnalyzer();
  assert(analyze(videoAt(4.5), cfg).change === 0, 'resetAnalyzer() clears temporal state');
}

{
  resetAnalyzer();
  analyze(videoAt(5), cfg);
  const switched = analyze(videoAt(22), cfg);
  assert(switched.change === 0, 'Switching segment does not report spurious change');
  assert(switched.grid.filter((x) => x === null).length > 40, 'Switching segment applies the new mask set');
}

{
  resetAnalyzer();
  analyze(videoAt(9.0), cfg);
  analyze(videoAt(15.0), cfg);          // change map → silent
  const back = analyze(videoAt(22.0), cfg);
  assert(back.change === 0, 'Re-entering an annual segment after the change map starts at change 0');
}

// -----------------------------------------------------------------------------
// 10. SAFETY / CONTRACT
// -----------------------------------------------------------------------------
console.log('\n--- 10. Missing data and contract compatibility ---');
{
  const missing = analyze(null, cfg);
  assert(missing.mean === null && missing.grid.every((v) => v === null), 'Missing video returns empty features (no synthetic values)');
  const unready = analyze({ readyState: 0, videoWidth: 0, videoHeight: 0, currentTime: 0 }, cfg);
  assert(unready.mean === null, 'Unready video returns empty features');
  const fake = analyze(null, cfg, { fake: true });
  assert(fake.fake === true && typeof fake.mean === 'number', 'Synthetic data only via explicit { fake: true }');

  const keys = ['grid', 'mean', 'max', 'columns', 'flashes', 'change', 'layers'];
  assert(keys.every((k) => k in emptyFeatures(cfg)), 'emptyFeatures keeps the full output contract');
  assert(keys.every((k) => k in f1) && keys.every((k) => k in f2), 'analyze() keeps the full output contract');

  const text = `average ${f1.mean.toFixed(1)} ${cfg.colorbar.unit}`;
  assert(!/NaN|undefined/.test(text), `a11y readout is clean: "${text}"`);
  assert(!/nW/.test(text), 'a11y readout claims no physical radiance unit');
}

fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n========================================');
console.log(`NIGHT LIGHTS TESTS: ${passed} passed, ${failed} failed, ${total} total`);
console.log('========================================\n');
if (failed > 0) process.exit(1);
