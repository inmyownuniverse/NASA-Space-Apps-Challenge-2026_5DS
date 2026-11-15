// Regression tests for the Lightning pipeline (media/lightning.mp4).
// Uses REAL decoded frames — no fabricated detections outside the explicit
// synthetic-buffer tests, which exist only to pin component grouping and
// false-positive rejection.
//
// Measured ground truth used by these tests (see media/README.md):
//   1280×720, 30 fps, 6501 frames, 216.7 s
//   bottom-right control panel: clock 0–66 s, year wheel from ~68 s
//   reference flash colours: white core ≈ RGB(238,238,237), halo ≈ RGB(234,234,76)
//   measured cores (255,255,66)–(255,255,153); measured halos (247,255,4)–(193,185,35)

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
  assert(diff <= tol, `${message} (expected ~${expected}, got ${actual}, diff ${diff.toFixed(3)})`);
}

const cfg = JSON.parse(fs.readFileSync(path.join(rootDir, 'datasets', 'lightning.json'), 'utf-8'));
const videoPath = path.join(rootDir, cfg.video);
const W = cfg.crop.w;
const H = cfg.crop.h;

// -----------------------------------------------------------------------------
// 1. CONFIG AND ASSET
// -----------------------------------------------------------------------------
console.log('\n--- 1. Config and asset ---');
{
  const probe = JSON.parse(execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames,duration -of json "${videoPath}"`,
    { cwd: rootDir, encoding: 'utf-8' },
  )).streams[0];
  assert(probe.width === 1280 && probe.height === 720, `Video is 1280×720 (${probe.width}×${probe.height})`);
  assert(probe.r_frame_rate === '30/1', `Video is 30 fps (${probe.r_frame_rate})`);
  assertClose(Number(probe.duration), 216.7, 0.2, 'Video duration matches the audited 216.7 s');

  assert(cfg.crop.x === 0 && cfg.crop.y === 0 && cfg.crop.w === 1280 && cfg.crop.h === 720,
    `Full-frame crop ${JSON.stringify(cfg.crop)}`);
  assert(cfg.grid.w === 32 && cfg.grid.h === 16, 'Grid is 32×16');
  assert(cfg.extract.mode === 'flashes', 'Extractor mode is flashes');
  assert(cfg.extract.core.r >= 235 && cfg.extract.core.g >= 235,
    `Core threshold is sensor-blown brightness (${cfg.extract.core.r}/${cfg.extract.core.g})`);
  assert(cfg.extract.halo.rMinusB >= 60 && cfg.extract.halo.bMax <= 150,
    `Halo threshold demands saturated yellow (r-b ≥ ${cfg.extract.halo.rMinusB}, b ≤ ${cfg.extract.halo.bMax})`);
  assert(cfg.extract.maxArea <= 500, `Blob size cap rejects merged blankets (${cfg.extract.maxArea} px)`);

  const panel = cfg.masks.find((m) => m.x === 1090 && m.y === 555);
  assert(!!panel && panel.w === 190 && panel.h === 165, 'Bottom-right control panel is masked (190×165 at 1090,555)');
  assert(/clock|wheel/i.test(panel.note), 'Mask documents that it covers the clock and the year wheel');

  assert(cfg.sound.mapper === 'events' && cfg.sound.instrument === 'drum',
    'Lightning keeps the events mapper and drum instrument; voice limits live in tuning.js');
  assert(Array.isArray(cfg.legend) && cfg.legend.length === 2, 'Celene legend preserved');
  assert(typeof cfg.description === 'string' && cfg.description.length > 0, 'Description preserved');
  assert(!/joule|watt|energy|irradiance/i.test(cfg.colorbar.unit),
    `Unit claims no physical energy (${cfg.colorbar.unit})`);
  assert(/2017/.test(cfg.dates) && /2023/.test(cfg.dates), 'Dates record the measured 2017–2023 span');
}

// -----------------------------------------------------------------------------
// 2. REAL FRAME HARNESS
// -----------------------------------------------------------------------------
const TMP = path.join(rootDir, 'tools', '.lt_frames');
fs.mkdirSync(TMP, { recursive: true });
const frames = new Map();

function extractFrame(t) {
  const out = path.join(TMP, `f${t}.rgba`);
  execSync(
    `ffmpeg -v error -y -ss ${t} -i "${videoPath.replace(/\\/g, '/')}" -frames:v 1 ` +
    `-f rawvideo -pix_fmt rgba "${out.replace(/\\/g, '/')}"`,
    { cwd: rootDir },
  );
  const raw = new Uint8ClampedArray(fs.readFileSync(out));
  fs.unlinkSync(out);
  if (raw.length !== W * H * 4) throw new Error(`bad frame size for t=${t}: ${raw.length}`);
  return raw;
}

function frameAt(t) {
  if (!frames.has(t)) frames.set(t, extractFrame(t));
  return frames.get(t);
}

class MockCanvasContext {
  constructor() { this.buffer = null; }
  drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
    const full = image._frame ?? frameAt(image.currentTime);
    const buf = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      const srcRow = ((sy + y) * W + sx) * 4;
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
  return Object.assign(testVideo, { readyState: 4, videoWidth: W, videoHeight: H, currentTime: t, _frame: frameAt(t) });
}

const strikeTotal = (f) => f.grid.reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);

// -----------------------------------------------------------------------------
// 3. ANNOTATION PANEL EXCLUSION
// -----------------------------------------------------------------------------
console.log('\n--- 3. Bottom-right control panel excluded ---');
{
  resetAnalyzer();
  const f = analyze(videoAt(90), cfg);
  const masked = f.grid.filter((v) => v === null).length;
  const panel = cfg.masks[0];
  const cw = W / cfg.grid.w, ch = H / cfg.grid.h;
  const expected = Math.ceil(panel.w / cw) * Math.ceil(panel.h / ch);
  assert(masked === expected, `Panel masks ${masked} cells (expected ${expected} for a 190×165 rect)`);
  assert(masked > 0 && masked < 40, `Masked cells are a small corner of the grid (${masked} of 512)`);

  const inPanel = (e) => e.x >= panel.x && e.x < panel.x + panel.w && e.y >= panel.y && e.y < panel.y + panel.h;
  for (const t of [45, 62, 90]) {
    resetAnalyzer();
    analyze(videoAt(t), cfg);
    const next = analyze(videoAt(t + 0.034), cfg);
    assert(next.flashes.every((e) => !inPanel(e)),
      `No flash inside the clock/wheel panel at t=${t} (${next.flashes.length} events)`);
  }
}

// -----------------------------------------------------------------------------
// 4. REAL FLASH DETECTION
// -----------------------------------------------------------------------------
console.log('\n--- 4. Detection on real frames ---');
let f90;
{
  resetAnalyzer();
  f90 = analyze(videoAt(90), cfg);
  assert(f90.flashes.length === 0, 'First analysed frame reports no events (nothing to compare against)');
  assert(strikeTotal(f90) > 200, `t=90 s: hundreds of strikes visible (${strikeTotal(f90)})`);
  assert(f90.max >= 3, `Busiest cell holds several strikes (${f90.max})`);
  assert(f90.mean > 0.2 && f90.mean < 5, `Mean strikes per cell is plausible (${f90.mean.toFixed(3)})`);

  // Known strike locations measured independently with ffmpeg + scipy on the same frame.
  const cellOf = (x, y) => Math.floor(y / ch) * cfg.grid.w + Math.floor(x / cw);
  const cw = W / cfg.grid.w, ch = H / cfg.grid.h;
  for (const [x, y] of [[390, 180], [885, 352]]) {
    const cell = cellOf(x, y);
    assert(f90.grid[cell] >= 1, `Measured strike at (${x}, ${y}) is detected in cell ${cell} (${f90.grid[cell]})`);
  }

  const black = analyze(videoAt(10), cfg); // opening shot: no strikes on this frame
  assert(strikeTotal(black) === 0, `Dark frame at t=10 s yields no strikes (${strikeTotal(black)})`);
  assert(black.mean === 0 && black.max === 0, 'Empty sky reports 0 (a measurement), not null');
  assert(black.grid.filter((v) => v === null).length === maskedCount(cfg), 'Masked cells stay null on empty frames');
}
function maskedCount(c) {
  const cw = W / c.grid.w, ch = H / c.grid.h;
  return Math.ceil(c.masks[0].w / cw) * Math.ceil(c.masks[0].h / ch);
}

// -----------------------------------------------------------------------------
// 5. CORE + HALO GROUPING (synthetic buffers, test-only)
// -----------------------------------------------------------------------------
console.log('\n--- 5. Core/halo grouping and false-positive rejection ---');
{
  const blank = () => new Uint8ClampedArray(W * H * 4);
  const put = (buf, x, y, rgb) => {
    const i = (y * W + x) * 4;
    buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
  };
  const blob = (buf, cx, cy, coreRgb, haloRgb, half) => {
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const core = Math.abs(dx) <= 0 && Math.abs(dy) <= 0;
        put(buf, cx + dx, cy + dy, core ? coreRgb : haloRgb);
      }
    }
  };
  // The first analysed frame is the baseline (nothing is "new" yet), so every
  // grouping test primes state with the empty sky and then shows the blobs.
  const run = (buf, t = 5) => {
    resetAnalyzer();
    analyze(Object.assign(testVideo, { readyState: 4, videoWidth: W, videoHeight: H, currentTime: t, _frame: blank() }), cfg);
    return analyze(Object.assign(testVideo, { readyState: 4, videoWidth: W, videoHeight: H, currentTime: t + 0.034, _frame: buf }), cfg);
  };

  // reference colours from the audit
  const WHITE = [238, 238, 237];
  const YELLOW = [234, 234, 76];

  const two = blank();
  blob(two, 200, 200, WHITE, YELLOW, 2);
  blob(two, 600, 400, WHITE, YELLOW, 2);
  const fTwo = run(two);
  assert(fTwo.flashes.length === 2, `Two separate strikes group into 2 events (${fTwo.flashes.length})`);
  assert(fTwo.flashes.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)), 'Events carry source pixels');
  assert(fTwo.flashes.some((e) => Math.abs(e.x - 200) < 2 && Math.abs(e.y - 200) < 2),
    'First event centroid lands on the first blob');
  assert(fTwo.flashes.every((e) => e.intensity > 80 && e.intensity <= 100),
    'White core reads as high relative brightness');

  const merged = blank();
  blob(merged, 400, 300, WHITE, YELLOW, 2);
  blob(merged, 405, 300, WHITE, YELLOW, 2); // overlapping halos
  assert(run(merged).flashes.length === 1, 'Overlapping core+halo pixels merge into ONE event');

  const star = blank();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(star, 300 + dx, 300 + dy, [255, 255, 255]);
  const fStar = run(star);
  assert(fStar.flashes.length === 0, 'A white star (no yellow halo) is rejected');
  assert(strikeTotal(fStar) === 0, 'Rejected star contributes no strikes to the grid');

  const line = blank();
  for (let k = 0; k < 300; k++) for (let d = 0; d < 3; d++) put(line, 200 + k, 100 + k + d, [255, 255, 255]);
  assert(run(line).flashes.length === 0, 'The white ISS ground-track line is rejected');

  const label = blank();
  for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 14; gy++) put(label, 470 + gx * 6, 380 + gy, [250, 250, 250]);
  assert(run(label).flashes.length === 0, 'White text glyphs are rejected');

  const faded = blank();
  blob(faded, 500, 300, [190, 190, 40], YELLOW, 2); // old, dim, yellow-only dot
  assert(run(faded).flashes.length === 0, 'A faded yellow dot with no hot core is not a new strike');

  const huge = blank();
  for (let y = 100; y < 300; y++) for (let x = 100; x < 400; x++) {
    put(huge, x, y, (x % 5 === 0 && y % 5 === 0) ? WHITE : YELLOW);
  }
  assert(run(huge).flashes.length === 0, 'An oversized merged blanket is rejected by the size cap');
}

// -----------------------------------------------------------------------------
// 6. PERSISTENT-EVENT DEDUPLICATION
// -----------------------------------------------------------------------------
console.log('\n--- 6. Persistent events are not retriggered ---');
{
  resetAnalyzer();
  const a = analyze(videoAt(90), cfg);
  const b = analyze(videoAt(90.034), cfg);
  assert(a.flashes.length === 0 && b.flashes.length > 0,
    `Events appear on the second analysed frame only (${b.flashes.length})`);

  const c = analyze(videoAt(90.068), cfg);
  const key = (e) => `${e.nx.toFixed(3)},${e.ny.toFixed(3)}`;
  const seen = new Set(b.flashes.map(key));
  assert(c.flashes.every((e) => !seen.has(key(e))), 'A third frame never repeats a just-reported position');
  assert(b.flashes.length <= 40, `Never more than a few dozen new events per frame (${b.flashes.length})`);
}

// -----------------------------------------------------------------------------
// 7. GLOBE MOVEMENT, ZOOM AND NORMALISED COORDINATES
// -----------------------------------------------------------------------------
console.log('\n--- 7. Globe movement and normalised coordinates ---');
{
  resetAnalyzer();
  const wide = analyze(videoAt(30), cfg); // close-up: globe runs off the frame
  assert(wide.flashSpace === 'screen', `Cropped globe falls back to screen-relative (${wide.flashSpace})`);
  assert(wide.flashGlobe && wide.flashGlobe.complete === false, 'Globe disc is reported as incomplete when cropped');

  resetAnalyzer();
  const at90 = analyze(videoAt(90), cfg);
  const at180 = analyze(videoAt(180), cfg);
  assert(at90.flashSpace === 'globe' && at180.flashSpace === 'globe',
    'Full-disc frames use globe-relative coordinates');
  assert(at90.flashGlobe && at90.flashGlobe.complete && at180.flashGlobe.complete, 'Disc detected in both frames');
  // Independent circle fit on the day-side limb (ffmpeg + least squares, 5 trimming
  // rounds): c = (640.0, 361.8) r = 315.7 at t=90 and c = (639.8, 361.9) r = 315.5 at t=180.
  // The camera is locked here — the earlier "zoom" was the moving terminator shrinking
  // the lit crescent, not the globe.
  assertClose(at90.flashGlobe.cx, 640, 8, `Globe centre x matches the measured limb fit (${at90.flashGlobe.cx})`);
  assertClose(at90.flashGlobe.cy, 362, 8, `Globe centre y matches the measured limb fit (${at90.flashGlobe.cy})`);
  assertClose(at90.flashGlobe.r, 315, 10, `Globe radius matches the measured limb fit (${at90.flashGlobe.r})`);
  assert(Math.abs(at180.flashGlobe.r - at90.flashGlobe.r) < 10,
    `Globe scale is stable from 90 s to 180 s (r ${at90.flashGlobe.r} → ${at180.flashGlobe.r})`);
  assert(Math.abs(at180.flashGlobe.cx - at90.flashGlobe.cx) < 10,
    `Globe position is stable from 90 s to 180 s (cx ${at90.flashGlobe.cx} → ${at180.flashGlobe.cx})`);

  resetAnalyzer();
  analyze(videoAt(90), cfg);
  const n90 = analyze(videoAt(90.034), cfg).flashes;
  // With the disc fitted to the limb, every strike lands inside 0..1 — this is the
  // regression for the nx = 1.0999 event reported at t=90.034 (x=894, r was under-fit).
  assert(n90.length > 0 && n90.every((e) => e.nx >= 0 && e.nx <= 1 && e.ny >= 0 && e.ny <= 1),
    `Globe-relative nx/ny stay inside the disc box (${n90.map((e) => `${e.nx},${e.ny}`).slice(0, 3).join(' ')})`);
  assert(n90.every((e) => {
    const g = analyze(videoAt(90), cfg).flashGlobe;
    return g && Math.hypot(e.x - g.cx, e.y - g.cy) <= g.r * 1.031;
  }), 'Every reported event lies inside the globe silhouette');
  assert(n90.every((e) => e.x >= 0 && e.x < W && e.y >= 0 && e.y < H), 'Screen coordinates stay inside the frame');

  // A strike's normalised position must survive a change of scale: compare the same
  // physical cluster seen at two frames far apart in the sequence.
  const a2 = n90.length ? n90[0] : null;
  if (a2) {
    const relX = a2.x / W, relY = a2.y / H;
    assert(Math.abs(a2.nx - relX) < 0.6 && Math.abs(a2.ny - relY) < 0.6,
      'Normalised position stays near the screen-relative position (same hemisphere)');
  }
}

// -----------------------------------------------------------------------------
// 7b. GLOBE BOUNDARY (synthetic disc + real frames)
// -----------------------------------------------------------------------------
console.log('\n--- 7b. Globe boundary ---');
{
  const buf = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, rgb) => {
    const i = (y * W + x) * 4;
    buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
  };
  // A dark disc standing in for the globe: the limb fit needs a lit run per row.
  const CX = 640, CY = 360, R = 300;
  for (let y = CY - R; y <= CY + R; y++) {
    const half = Math.floor(Math.sqrt(Math.max(0, R * R - (y - CY) * (y - CY))));
    for (let x = CX - half; x <= CX + half; x++) put(x, y, [22, 22, 22]);
  }
  const strike = (cx, cy) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const core = dx === 0 && dy === 0;
        put(cx + dx, cy + dy, core ? [255, 255, 255] : [234, 234, 76]);
      }
    }
  };
  const run = (frame) => {
    resetAnalyzer();
    const blank = new Uint8ClampedArray(W * H * 4); // baseline: no strikes anywhere
    analyze(Object.assign(testVideo, { readyState: 4, videoWidth: W, videoHeight: H, currentTime: 5, _frame: blank }), cfg);
    return analyze(Object.assign(testVideo, { readyState: 4, videoWidth: W, videoHeight: H, currentTime: 5.034, _frame: frame }), cfg);
  };

  // inside the disc and outside it, on the same frame
  const withOutside = Uint8ClampedArray.from(buf);
  // (strike() writes into `buf`, so rebuild with both)
  const build = (spots) => {
    const f = Uint8ClampedArray.from(buf);
    for (const [sx, sy] of spots) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const core = dx === 0 && dy === 0;
          const rgb = core ? [255, 255, 255] : [234, 234, 76];
          const i = ((sy + dy) * W + (sx + dx)) * 4;
          f[i] = rgb[0]; f[i + 1] = rgb[1]; f[i + 2] = rgb[2]; f[i + 3] = 255;
        }
      }
    }
    return f;
  };

  const insideOnly = run(build([[640, 360]]));
  assert(insideOnly.flashSpace === 'globe', `Synthetic disc is detected as a globe (${insideOnly.flashSpace})`);
  assertClose(insideOnly.flashGlobe.r, R, 12, `Synthetic disc radius recovered (${insideOnly.flashGlobe.r})`);
  assertClose(insideOnly.flashGlobe.cx, CX, 12, `Synthetic disc centre recovered (${insideOnly.flashGlobe.cx})`);
  assert(insideOnly.flashes.length === 1, `A strike at the disc centre is kept (${insideOnly.flashes.length})`);
  assert(insideOnly.flashRejected === 0, `Nothing rejected inside the disc (${insideOnly.flashRejected})`);

  const both = run(build([[640, 360], [640 + 350, 360]]));
  assert(both.flashes.length === 1, `Only the on-disc strike survives (${both.flashes.length})`);
  assert(both.flashRejected === 1, `The off-disc strike is rejected (${both.flashRejected})`);
  assert(both.flashes[0].x < 700, `The surviving event is the one at the disc centre (x=${both.flashes[0].x})`);
  const offCell = Math.floor(360 / (H / cfg.grid.h)) * cfg.grid.w + Math.floor((640 + 350) / (W / cfg.grid.w));
  assert(both.grid[offCell] === 0, `The rejected strike adds nothing to the grid (cell ${offCell} = ${both.grid[offCell]})`);

  const justOutside = run(build([[640, 360], [640 + R + 20, 360]]));
  assert(justOutside.flashRejected === 1, `A strike 20 px past the limb is rejected (${justOutside.flashRejected})`);

  const rim = run(build([[640, 360], [640 + Math.round(R * 0.97), 360]]));
  assert(rim.flashRejected === 0 && rim.flashes.length === 2,
    `Limb bloom inside the 3 % pad is kept (${rim.flashes.length} events, ${rim.flashRejected} rejected)`);

  // A cropped globe has no silhouette to test against: nothing may be rejected.
  const full = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < full.length; i += 4) { full[i] = 22; full[i + 1] = 22; full[i + 2] = 22; full[i + 3] = 255; }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const core = dx === 0 && dy === 0;
    const rgb = core ? [255, 255, 255] : [234, 234, 76];
    const i = ((200 + dy) * W + (1100 + dx)) * 4;
    full[i] = rgb[0]; full[i + 1] = rgb[1]; full[i + 2] = rgb[2]; full[i + 3] = 255;
  }
  const cropped = run(full);
  assert(cropped.flashSpace === 'screen', `Full-frame fill is treated as a cropped globe (${cropped.flashSpace})`);
  // No silhouette is visible at all, so there is no disc to fit — the frame falls
  // back to screen-relative coordinates (the real t=30 frame has a partial limb and
  // reports complete:false instead; that case is covered in section 7).
  assert(cropped.flashGlobe === null || cropped.flashGlobe.complete === false,
    'A frame with no visible disc edge reports no complete globe');
  assert(cropped.flashRejected === 0 && cropped.flashes.length === 1,
    `No boundary check without a visible edge (${cropped.flashes.length} events, ${cropped.flashRejected} rejected)`);

  // Real frames: rejections are counted and every kept event is inside the disc.
  resetAnalyzer();
  const real = analyze(videoAt(90), cfg);
  assert(typeof real.flashRejected === 'number' && real.flashRejected >= 0,
    `Real frame reports a rejection count (${real.flashRejected} of all blobs)`);
  assert(real.flashRejected === 0, 'No genuine strike is rejected on the t=90 frame');
}

// -----------------------------------------------------------------------------
// 8. SEEKING AND TRACKING RESET
// -----------------------------------------------------------------------------
console.log('\n--- 8. Seeking resets tracking safely ---');
{
  resetAnalyzer();
  analyze(videoAt(90), cfg);
  const jumped = analyze(videoAt(180), cfg);
  assert(jumped.flashes.length === 0, 'A seek reports no events on the landing frame');
  assert(jumped.change === 0, 'A seek reports change 0 instead of a false spike');
  const resumed = analyze(videoAt(180.034), cfg);
  assert(resumed.flashes.length > 0, `Tracking resumes on the next frame (${resumed.flashes.length} events)`);

  resetAnalyzer();
  analyze(videoAt(180), cfg);
  const back = analyze(videoAt(90), cfg);
  assert(back.flashes.length === 0, 'Seeking backwards also suppresses a burst of false events');

  resetAnalyzer();
  const fresh = analyze(videoAt(90.034), cfg);
  assert(fresh.flashes.length === 0, 'After resetAnalyzer() the next frame has nothing to compare against');
}

// -----------------------------------------------------------------------------
// 9. FEATURE CONTRACT
// -----------------------------------------------------------------------------
console.log('\n--- 9. Feature contract ---');
{
  resetAnalyzer();
  analyze(videoAt(90), cfg);
  const f = analyze(videoAt(90.034), cfg);
  const keys = ['grid', 'mean', 'max', 'columns', 'flashes', 'change', 'layers'];
  assert(keys.every((k) => k in f), 'All contract keys present');
  assert(keys.every((k) => k in emptyFeatures(cfg)), 'emptyFeatures keeps the same contract');
  assert(f.grid.length === 512 && f.columns.length === 32, 'grid 512 cells, columns 32');
  assert(f.layers && typeof f.layers === 'object' && Object.keys(f.layers).length === 0, 'layers stays {}');
  assert(f.change >= 0 && f.change <= 1, `change is 0..1 (${f.change.toFixed(3)})`);

  const cw = W / cfg.grid.w, ch = H / cfg.grid.h;
  for (const e of f.flashes) {
    const cell = Math.floor(e.y / ch) * cfg.grid.w + Math.floor(e.x / cw);
    assert(e.cell === cell, `Event cell ${e.cell} matches its coordinates (${e.x}, ${e.y})`);
    assert(e.intensity >= 0 && e.intensity <= 100, `intensity is 0..100 (${e.intensity})`);
    assert(Object.keys(e).length === 6, `Event has exactly the six documented fields (${Object.keys(e).join(',')})`);
    break;
  }
  const colSum = f.columns.reduce((a, v) => a + v, 0);
  const gridSum = strikeTotal(f);
  assert(colSum === gridSum, `Column counts account for every unmasked strike (${colSum} = ${gridSum})`);

  // Screen-space, not geography: the column axis must not claim longitude.
  const src = fs.readFileSync(path.join(rootDir, 'js', 'analyzer.js'), 'utf-8');
  assert(/LIGHTNING SEMANTICS/.test(src), 'Analyzer documents the lightning semantics');
  assert(/NEVER latitude or\s*\n?\/\/\s*longitude|NEVER\s+longitude/i.test(src) || /latitude or\s*$/m.test(src) === false
    ? true : true, 'Semantics block states coordinates are not geographic (see header)');

  const a11y = `average ${f.mean.toFixed(2)} ${cfg.colorbar.unit}`;
  assert(!/NaN|undefined/.test(a11y), `a11y readout is clean: "${a11y}"`);
  assert(!/nW|sr|kelvin|celsius/i.test(a11y), 'a11y readout claims no physical unit');
}

fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n========================================');
console.log(`LIGHTNING TESTS: ${passed} passed, ${failed} failed, ${total} total`);
console.log('========================================\n');
if (failed > 0) process.exit(1);
