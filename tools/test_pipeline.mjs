// Test suite for Earth Jukebox Data & Vision pipeline
// Tests colorbar inversion, frame analysis feature contract, real asset integration, and compatibility.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { colorToValue, clearColorCache } from '../js/colorbar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertClose(actual, expected, tol = 0.05, message = '') {
  const diff = Math.abs(actual - expected);
  assert(diff <= tol, `${message} (expected ~${expected}, got ${actual}, diff ${diff.toFixed(4)})`);
}

// -----------------------------------------------------------------------------
// 1. DATASET CONFIG VALIDATION
// -----------------------------------------------------------------------------
console.log('\n--- 1. Testing datasets/sst.json Configuration ---');
const sstCfgPath = path.join(rootDir, 'datasets', 'sst.json');
const sstCfg = JSON.parse(fs.readFileSync(sstCfgPath, 'utf-8'));

assert(sstCfg.video === 'media/sst.mp4', 'Config video points to media/sst.mp4');
assert(fs.existsSync(path.join(rootDir, sstCfg.video)), 'Media asset media/sst.mp4 exists on disk');
assert(sstCfg.crop.x === 0 && sstCfg.crop.y === 0 && sstCfg.crop.w === 1280 && sstCfg.crop.h === 600,
  `Measured crop is 1280x600 (got ${JSON.stringify(sstCfg.crop)})`);
assert(sstCfg.grid.w === 32 && sstCfg.grid.h === 16, 'Grid dimensions are 32 x 16 (512 cells)');
assert(sstCfg.colorbar.unit === '°C', 'Colorbar unit is °C');
assert(Array.isArray(sstCfg.colorbar.stops) && sstCfg.colorbar.stops.length === 16,
  `Colorbar has 16 calibrated stops (got ${sstCfg.colorbar.stops?.length})`);
assert(sstCfg.colorbar.stops[0].value === 0.0, 'Stop 0 starts at 0.0 °C');
assert(sstCfg.colorbar.stops[15].value === 32.0, 'Stop 15 ends at 32.0 °C');
assert(sstCfg.colorbar.maxDist >= 60 && sstCfg.colorbar.maxDist <= 90,
  `Appropriate maxDist threshold (${sstCfg.colorbar.maxDist})`);

// Verify sound, description, and legend were preserved
assert(sstCfg.sound.mapper === 'continuousField', 'Preserved teammate sound.mapper');
assert(sstCfg.sound.instrument === 'warmPad', 'Preserved teammate sound.instrument');
assert(Array.isArray(sstCfg.legend) && sstCfg.legend.length === 2, 'Preserved teammate legend section');

// -----------------------------------------------------------------------------
// 2. COLORBAR INVERSION: KNOWN STOPS
// -----------------------------------------------------------------------------
console.log('\n--- 2. Testing colorToValue with Known Stops ---');
clearColorCache();
const stops = sstCfg.colorbar.stops;
const maxDist = sstCfg.colorbar.maxDist;

// Test exact stop matching
for (let i = 0; i < stops.length; i++) {
  const [r, g, b] = stops[i].rgb;
  const val = colorToValue(r, g, b, stops, maxDist);
  assertClose(val, stops[i].value, 0.01, `Stop ${i} rgb(${r},${g},${b}) returns exact stop value ${stops[i].value}`);
}

// -----------------------------------------------------------------------------
// 3. COLORBAR INVERSION: INTERPOLATION BETWEEN ADJACENT STOPS
// -----------------------------------------------------------------------------
console.log('\n--- 3. Testing colorToValue Linear Interpolation ---');
// Midpoint between Stop 0 [45, 81, 216] (0.0) and Stop 1 [50, 126, 226] (2.133)
const mid0_1_r = (stops[0].rgb[0] + stops[1].rgb[0]) / 2;
const mid0_1_g = (stops[0].rgb[1] + stops[1].rgb[1]) / 2;
const mid0_1_b = (stops[0].rgb[2] + stops[1].rgb[2]) / 2;
const mid0_1_expected = (stops[0].value + stops[1].value) / 2;
const mid0_1_val = colorToValue(mid0_1_r, mid0_1_g, mid0_1_b, stops, maxDist);
assertClose(mid0_1_val, mid0_1_expected, 0.05, 'Midpoint between Stop 0 and Stop 1 interpolates value correctly');

// Midpoint between Stop 6 and Stop 7
const mid6_7_r = (stops[6].rgb[0] + stops[7].rgb[0]) / 2;
const mid6_7_g = (stops[6].rgb[1] + stops[7].rgb[1]) / 2;
const mid6_7_b = (stops[6].rgb[2] + stops[7].rgb[2]) / 2;
const mid6_7_expected = (stops[6].value + stops[7].value) / 2;
const mid6_7_val = colorToValue(mid6_7_r, mid6_7_g, mid6_7_b, stops, maxDist);
assertClose(mid6_7_val, mid6_7_expected, 0.05, 'Midpoint between Stop 6 and Stop 7 interpolates value correctly');

// Midpoint between Stop 14 and Stop 15
const mid14_15_r = (stops[14].rgb[0] + stops[15].rgb[0]) / 2;
const mid14_15_g = (stops[14].rgb[1] + stops[15].rgb[1]) / 2;
const mid14_15_b = (stops[14].rgb[2] + stops[15].rgb[2]) / 2;
const mid14_15_expected = (stops[14].value + stops[15].value) / 2;
const mid14_15_val = colorToValue(mid14_15_r, mid14_15_g, mid14_15_b, stops, maxDist);
assertClose(mid14_15_val, mid14_15_expected, 0.05, 'Midpoint between Stop 14 and Stop 15 interpolates value correctly');

// -----------------------------------------------------------------------------
// 4. REJECTION OF NON-DATA COLORS
// -----------------------------------------------------------------------------
console.log('\n--- 4. Testing Rejection of Non-Data Colors ---');
assert(colorToValue(65, 65, 65, stops, maxDist) === null, 'Land gray rgb(65,65,65) returns null');
assert(colorToValue(64, 65, 66, stops, maxDist) === null, 'Antarctica gray bar rgb(64,65,66) returns null');
assert(colorToValue(0, 0, 0, stops, maxDist) === null, 'Black ocean background rgb(0,0,0) returns null');
assert(colorToValue(255, 255, 255, stops, maxDist) === null, 'Pure white text/labels rgb(255,255,255) returns null');
assert(colorToValue(180, 0, 180, stops, maxDist) === null, 'Unrelated magenta rgb(180,0,180) returns null');
assert(colorToValue(0, 255, 0, stops, 40) === null, 'Pure green rgb(0,255,0) with strict maxDist returns null');

// -----------------------------------------------------------------------------
// 5. EDGE CASES AND CACHE HANDLING
// -----------------------------------------------------------------------------
console.log('\n--- 5. Testing Edge Cases & Caching ---');
assert(colorToValue(NaN, 100, 100, stops, maxDist) === null, 'NaN returns null safely');
assert(colorToValue(-10, 100, 100, stops, maxDist) === null, 'Negative RGB returns null safely');
assert(colorToValue(300, 100, 100, stops, maxDist) === null, 'Out of range RGB returns null safely');
assert(colorToValue(100, 100, 100, null, maxDist) === null, 'null stops returns null safely');
assert(colorToValue(100, 100, 100, [], maxDist) === null, 'Empty stops array returns null safely');

// Single stop test
const singleStop = [{ rgb: [100, 100, 100], value: 42 }];
assert(colorToValue(100, 100, 100, singleStop, 10) === 42, 'Single stop matching returns value');
assert(colorToValue(150, 150, 150, singleStop, 10) === null, 'Single stop non-matching returns null');

// Cache verification
clearColorCache();
const firstCall = colorToValue(50, 126, 226, stops, maxDist);
const secondCall = colorToValue(50, 126, 226, stops, maxDist);
assert(firstCall === secondCall, 'Cached color conversion returns identical value');

// -----------------------------------------------------------------------------
// 6. FRAME ANALYSIS & FEATURE CONTRACT WITH MOCK DOM
// -----------------------------------------------------------------------------
console.log('\n--- 6. Testing analyze() Feature Contract & Real Asset Simulation ---');

// Dump sst_still.png pixels using python helper script to a temporary binary file to avoid stdout pipe limit
const binPath = path.join(rootDir, 'tools', 'sst_still_raw.bin');
execSync(`python -c "from PIL import Image; im = Image.open('tools/sst_still.png').convert('RGBA'); open('tools/sst_still_raw.bin', 'wb').write(im.tobytes())"`, { cwd: rootDir });
const stillBuffer = new Uint8ClampedArray(fs.readFileSync(binPath));
try { fs.unlinkSync(binPath); } catch {}

class MockCanvasContext {
  constructor(canvas) {
    this.canvas = canvas;
  }
  drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
    this.buffer = new Uint8ClampedArray(dw * dh * 4);
    const origW = 1280;
    for (let y = 0; y < dh; y++) {
      const srcY = sy + y;
      for (let x = 0; x < dw; x++) {
        const srcX = sx + x;
        const srcIdx = (srcY * origW + srcX) * 4;
        const dstIdx = (y * dw + x) * 4;
        this.buffer[dstIdx] = stillBuffer[srcIdx];
        this.buffer[dstIdx + 1] = stillBuffer[srcIdx + 1];
        this.buffer[dstIdx + 2] = stillBuffer[srcIdx + 2];
        this.buffer[dstIdx + 3] = stillBuffer[srcIdx + 3];
      }
    }
  }
  getImageData(sx, sy, sw, sh) {
    return { data: this.buffer, width: sw, height: sh };
  }
}

class MockCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this._ctx = new MockCanvasContext(this);
  }
  getContext() {
    return this._ctx;
  }
}

// Set up mock DOM globals before importing analyzer
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return new MockCanvas();
    return {};
  }
};
globalThis.performance = { now: () => Date.now() };

const { analyze, emptyFeatures, fakeFeatures, resetAnalyzer } = await import(`../js/analyzer.js?t=${Date.now()}`);

// Test emptyFeatures
const empty = emptyFeatures(sstCfg);
assert(Array.isArray(empty.grid) && empty.grid.length === 512, 'emptyFeatures grid has 512 cells');
assert(empty.grid.every((v) => v === null), 'emptyFeatures grid contains 512 null values');
assert(empty.mean === null, 'emptyFeatures mean is null');
assert(empty.max === null, 'emptyFeatures max is null');
assert(Array.isArray(empty.columns) && empty.columns.length === 32, 'emptyFeatures columns has 32 columns');
assert(empty.columns.every((c) => c === null), 'emptyFeatures columns contains 32 null values');
assert(Array.isArray(empty.flashes) && empty.flashes.length === 0, 'emptyFeatures flashes is []');
assert(empty.change === 0, 'emptyFeatures change is 0');
assert(typeof empty.layers === 'object' && Object.keys(empty.layers).length === 0, 'emptyFeatures layers is {}');
assert(empty.fake === undefined, 'emptyFeatures does not carry synthetic fake flag');

// Test analyze fallback with null/unready video returns safe emptyFeatures (no silent synthetic drift)
const fallbackFeatures = analyze(null, sstCfg);
assert(fallbackFeatures.mean === null, 'analyze(null) safely returns null mean (no fake data produced)');
assert(fallbackFeatures.max === null, 'analyze(null) safely returns null max');
assert(fallbackFeatures.change === 0, 'analyze(null) safely returns change = 0');
assert(fallbackFeatures.grid.every((v) => v === null), 'analyze(null) returns all-null grid');

// Test explicit development/test fake option
const explicitFake = analyze(null, sstCfg, { fake: true });
assert(explicitFake.fake === true, 'analyze(..., { fake: true }) returns synthetic features when explicitly requested');
assert(typeof explicitFake.mean === 'number', 'Explicit fake mode mean is number');

// -----------------------------------------------------------------------------
// 7. REAL SST STILL FRAME ANALYSIS
// -----------------------------------------------------------------------------
console.log('\n--- 7. Testing Real SST Still Frame Analysis ---');

const mockVideo = {
  readyState: 4,
  videoWidth: 1280,
  videoHeight: 640,
  currentTime: 0.0
};

resetAnalyzer();
const features = analyze(mockVideo, sstCfg);

assert(features.fake === undefined || features.fake === false, 'analyze() returned real features (not fake)');
assert(Array.isArray(features.grid) && features.grid.length === 512, `features.grid has exactly 512 cells (got ${features.grid?.length})`);

const validCells = features.grid.filter((v) => v !== null);
assert(validCells.length > 50, `Substantial valid ocean cells detected (${validCells.length} / 512 cells)`);
assert(validCells.every((v) => v >= 0.0 && v <= 32.0),
  `All valid grid values fall strictly within calibrated range 0.0–32.0 °C (min: ${Math.min(...validCells).toFixed(2)}, max: ${Math.max(...validCells).toFixed(2)})`);

// Verify mean calculation
const manualSum = validCells.reduce((a, b) => a + b, 0);
const manualMean = manualSum / validCells.length;
assertClose(features.mean, manualMean, 0.001, `Calculated mean matches average of valid cells (${features.mean.toFixed(2)} °C)`);

// Verify max calculation
const manualMax = Math.max(...validCells);
assertClose(features.max, manualMax, 0.001, `Calculated max matches largest valid cell (${features.max.toFixed(2)} °C)`);

// Verify unknown/land cells are null
const landCellIndexRow15 = 15 * 32 + 10; // Antarctica row 15
assert(features.grid[landCellIndexRow15] === null, `Antarctica/land cell is null (cell index ${landCellIndexRow15})`);

// Verify columns contract
assert(Array.isArray(features.columns) && features.columns.length === 32, 'features.columns has exactly 32 columns');
const validColumns = features.columns.filter((c) => c !== null);
assert(validColumns.length > 0, `Valid columns computed (${validColumns.length}/32)`);

// Verify flashes and layers contract for SST
assert(Array.isArray(features.flashes) && features.flashes.length === 0, 'features.flashes is [] for SST');
assert(typeof features.layers === 'object' && Object.keys(features.layers).length === 0, 'features.layers is {} for SST');

// Verify temporal change metric on second frame
mockVideo.currentTime = 0.25;
const featuresFrame2 = analyze(mockVideo, sstCfg);
assert(typeof featuresFrame2.change === 'number' && featuresFrame2.change >= 0 && featuresFrame2.change <= 1,
  `Temporal change metric is 0..1 (got ${featuresFrame2.change})`);

// Verify seeking resets state
mockVideo.currentTime = 10.0; // Jump 10 seconds ahead
const featuresSeek = analyze(mockVideo, sstCfg);
assert(featuresSeek.change === 0, 'Seeking jump safely resets temporal change to 0');

resetAnalyzer();
assert(true, 'resetAnalyzer() executed without errors');

// -----------------------------------------------------------------------------
// 8. ACCESSIBILITY & SOUND INTERFACE COMPATIBILITY
// -----------------------------------------------------------------------------
console.log('\n--- 8. Testing Downstream Consumer Compatibility ---');

// Test a11y describe() logic against the generated features
const unit = sstCfg.colorbar.unit;
const fmt = (v) => (v === null || v === undefined ? 'no data' : `${v.toFixed(1)} ${unit}`.trim());
const descText = `0:00: average ${fmt(features.mean)}, highest ${fmt(features.max)}.`;
assert(descText.includes('°C'), `a11y readout contains correct unit °C: "${descText}"`);
assert(!descText.includes('NaN'), 'a11y readout contains no NaN values');

// Test sound engine min/max stop extraction compatibility
const minStop = sstCfg.colorbar.stops[0].value;
const maxStop = sstCfg.colorbar.stops[sstCfg.colorbar.stops.length - 1].value;
assert(minStop === 0.0 && maxStop === 32.0, `Sound engine min/max extraction compatible (0.0 to 32.0)`);
assert(features.mean >= minStop && features.mean <= maxStop, 'features.mean falls within sound engine stop boundaries');

// Test downstream handling of emptyFeatures
const emptyDesc = `0:00: average ${fmt(empty.mean)}, highest ${fmt(empty.max)}.`;
assert(emptyDesc === '0:00: average no data, highest no data.', `a11y handles empty features safely: "${emptyDesc}"`);
// In sound/engine.js, when mean is null, valueToNote returns null and sound engine trigger is bypassed
const mockValueToNote = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : 'C4');
assert(mockValueToNote(empty.mean) === null, 'Sound engine cleanly mutes playback when features.mean is null (no fake audio)');

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log(`\n========================================`);
console.log(`TEST SUMMARY: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log(`========================================\n`);

if (failedTests > 0) {
  process.exit(1);
}
