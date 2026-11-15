// Owner: Hazel · Support: Jaden
// Player: drives the video and the per-frame loop analyse → sound → description.

import { analyze, resetAnalyzer } from './analyzer.js';
import { playFrame, releaseAll, startScan, stopScan } from './sound/engine.js';
import { demoFeatures } from './sound/demo.js';
import { describe, announce } from './a11y.js';
import { enableExplore } from './explore.js';

const STEP = 0.25;      // analyse every 0.25 s of media time

let video, canvas, ctx, message;
let cfg = null;
let mode = 'play';
let playing = false;
let missing = false;       // video file not found → simulated clock so sound still works
let lastT = -Infinity;
let simStart = 0, simOffset = 0;
let rafId = null, vfcId = null;
let disableExplore = null;
let latest = null;         // features of the last analysed frame (Scan, Explore, summaries)

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function els() {
  if (video) return;
  video = document.getElementById('video');
  canvas = document.getElementById('overlay');
  ctx = canvas.getContext('2d');
  message = document.getElementById('player-message');

  video.addEventListener('error', () => {
    missing = true;
    showMessage(`Video not found. Download it from the SVS page (${cfg?.source ?? ''}) and save as ${cfg?.video ?? 'media/'}.`);
  });
  video.addEventListener('loadeddata', () => { missing = false; showMessage(''); });
  video.addEventListener('ended', () => pause());
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}

/** Current media time (real video time, or a simulated clock if the video is missing). */
export function currentTime() {
  if (missing || !video) return playing ? simOffset + (performance.now() - simStart) / 1000 : simOffset;
  return video.currentTime;
}

/** Load a dataset config into the player. */
export function load(newCfg) {
  els();
  pause();
  cfg = newCfg;
  latest = null; // features of the previous dataset must not leak into Explore or summaries
  missing = false;
  simOffset = 0;
  lastT = -Infinity;
  resetAnalyzer();
  showMessage('');
  video.src = cfg.video;
  video.load();
  setMode(mode);
}

/** Start playback and the frame loop. */
export async function play() {
  if (!cfg) return;
  els();
  playing = true;
  if (!missing) {
    try { await video.play(); } catch { missing = true; }
  }
  if (missing) simStart = performance.now();
  announce(`Playing ${cfg.title}`);
  loop();
}

/** Features of the most recent analysed frame, or null before the first frame. */
export function latestFeatures() { return latest; }

/** Pause playback and silence all notes. */
export function pause() {
  if (!video) return;
  stopScanning();
  if (playing && missing) simOffset = currentTime();
  playing = false;
  video.pause();
  if (rafId) cancelAnimationFrame(rafId);
  if (vfcId && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfcId);
  rafId = vfcId = null;
  releaseAll();
}

export function isPlaying() { return playing; }

/** Jump to time t (seconds). */
export function seek(t) {
  els();
  const dur = duration();
  t = Math.max(0, dur ? Math.min(t, dur) : t);
  if (missing) {
    simOffset = t;
    simStart = performance.now();
  } else {
    video.currentTime = t;
  }
  lastT = -Infinity;
  resetAnalyzer();
  releaseAll();
}

export function duration() {
  return video && Number.isFinite(video.duration) ? video.duration : 0;
}

/** Switch mode: 'play' | 'scan' | 'explore'. */
export function setMode(m) {
  els();
  mode = m;
  disableExplore?.();
  disableExplore = null;
  stopScanning();
  canvas.classList.toggle('scanning', m === 'scan');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (m === 'explore' && cfg) disableExplore = enableExplore(canvas, cfg);
  if (m === 'scan' && cfg) startScanning();
}

/** Analyse the frame on screen right now (or sample data when there is no video). */
function analyseNow(t) {
  latest = missing ? demoFeatures(cfg, t) : analyze(video, cfg);
  return latest;
}

// ---- Scan mode: pause on the current frame and sweep it west to east, one column per beat ----
let scanning = false;

function startScanning() {
  if (playing) pause();
  if (!missing && video.readyState < 2) {
    // Frame not decoded yet (dataset just loaded): start once it is, or once we know it's missing.
    const retry = () => { if (mode === 'scan' && !scanning) startScanning(); };
    video.addEventListener('loadeddata', retry, { once: true });
    video.addEventListener('error', retry, { once: true });
    return;
  }
  const t = currentTime();
  const frame = analyseNow(t);
  describe(frame, cfg, t);
  scanning = true;
  startScan(cfg, () => frame, (col, notes) => {
    drawScanColumn(col);
    const text = `Column ${col + 1} of ${cfg.grid.w}, west to east: ${notes.join(' ') || 'no data'}${frame.fake ? ' (sample data)' : ''}`;
    const readout = document.getElementById('readout-value');
    if (readout) readout.textContent = text;
  });
  announce('Scan mode: sweeping this frame from west to east. Press Space to go back to playing.');
}

function stopScanning() {
  if (!scanning) return;
  scanning = false;
  stopScan();
  releaseAll();
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}

export function isScanning() { return scanning; }

function drawScanColumn(col) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (reducedMotion.matches) return;
  const crop = cfg.crop ?? { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const vw = video.videoWidth || canvas.width, vh = video.videoHeight || canvas.height;
  // The video keeps its shape inside the 16:9 stage (black bars for other shapes).
  const s = Math.min(canvas.width / vw, canvas.height / vh);
  const ox = (canvas.width - vw * s) / 2, oy = (canvas.height - vh * s) / 2;
  const w = (crop.w / cfg.grid.w) * s;
  const x = ox + crop.x * s + col * w, y = oy + crop.y * s, h = crop.h * s;
  ctx.fillStyle = 'rgba(255, 210, 63, 0.35)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255, 210, 63, 0.9)';
  ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
}

function loop() {
  if (!playing) return;
  const useVfc = !missing && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  if (useVfc) {
    vfcId = video.requestVideoFrameCallback((_now, meta) => { tick(meta.mediaTime); loop(); });
  } else {
    rafId = requestAnimationFrame(() => { tick(currentTime()); loop(); });
  }
}

function tick(t) {
  if (t - lastT < STEP && t >= lastT) return;
  lastT = t;

  // No video file yet: analyseNow uses sample data shaped for this dataset, so it can still be heard.
  const features = analyseNow(t);
  playFrame(features, cfg, t);
  describe(features, cfg, t);
}
