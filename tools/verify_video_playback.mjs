// Real video playback & seeking verification using frames extracted from media/sst.mp4

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const sstCfg = JSON.parse(fs.readFileSync(path.join(rootDir, 'datasets', 'sst.json'), 'utf-8'));

// Load raw extracted video frames
const timestamps = [0.0, 0.25, 0.50, 0.75, 1.00, 30.00];
const frameBuffers = new Map();
for (const t of timestamps) {
  const filePath = path.join(rootDir, 'tools', `frame_${t.toFixed(2)}s.raw`);
  frameBuffers.set(t, new Uint8ClampedArray(fs.readFileSync(filePath)));
  fs.unlinkSync(filePath); // clean up
}

class MockCanvasContext {
  constructor(canvas) {
    this.canvas = canvas;
  }
  drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
    const raw = frameBuffers.get(image.currentTime);
    if (!raw) throw new Error(`No raw buffer for time ${image.currentTime}`);
    this.buffer = raw;
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

globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return new MockCanvas();
    return {};
  }
};
globalThis.performance = { now: () => Date.now() };

const { analyze, resetAnalyzer } = await import(`../js/analyzer.js?t=${Date.now()}`);

console.log('--- Simulating Real Video Playback Loop ---');
resetAnalyzer();

const mockVideo = {
  readyState: 4,
  videoWidth: 1280,
  videoHeight: 640,
  currentTime: 0.0
};

const playTimestamps = [0.0, 0.25, 0.50, 0.75, 1.00];
const results = [];

for (const t of playTimestamps) {
  mockVideo.currentTime = t;
  const feat = analyze(mockVideo, sstCfg);
  results.push({ t, feat });
  console.log(`t = ${t.toFixed(2)}s: mean = ${feat.mean.toFixed(2)} °C, max = ${feat.max.toFixed(2)} °C, valid_cells = ${feat.grid.filter(v => v !== null).length}/512, change = ${(feat.change * 100).toFixed(1)}%`);
}

// Verify that values dynamically change as currents advect
const means = results.map(r => r.feat.mean);
const changes = results.slice(1).map(r => r.feat.change);

console.log('\n--- Verification Checks ---');
const meanVariance = Math.max(...means) - Math.min(...means);
console.log(`Mean temperature variation over 1s: ${meanVariance.toFixed(4)} °C`);
console.log(`Average frame-to-frame streamline change: ${(changes.reduce((a, b) => a + b) / changes.length * 100).toFixed(2)}% of cells`);

if (changes.every(c => c > 0 && c <= 1.0)) {
  console.log('PASS: Streamline visual motion between consecutive frames produces valid non-zero change metrics.');
} else {
  console.error('FAIL: Change metric is 0 during active playback.');
  process.exit(1);
}

// Test Seeking to t = 30.0s (scrubbing forward)
console.log('\n--- Simulating User Scrub / Seek to t = 30.0s ---');
mockVideo.currentTime = 30.0;
const seekFeat = analyze(mockVideo, sstCfg);
console.log(`Seek to t = 30.00s: mean = ${seekFeat.mean.toFixed(2)} °C, max = ${seekFeat.max.toFixed(2)} °C, change = ${(seekFeat.change * 100).toFixed(1)}%`);

if (seekFeat.change === 0) {
  console.log('PASS: Seeking across time jump safely resets temporal change to 0 (no spurious change spikes).');
} else {
  console.error(`FAIL: Seeking produced non-zero change: ${seekFeat.change}`);
  process.exit(1);
}

console.log('\nALL REAL ASSET VIDEO TESTS PASSED.');

