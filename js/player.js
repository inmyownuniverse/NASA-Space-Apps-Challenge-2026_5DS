// Owner: Hazel · Support: Jaden
// Player: drives the video and the per-frame loop analyse → sound → description.

import { analyze, resetAnalyzer } from './analyzer.js';
import { playFrame, releaseAll } from './sound/engine.js';
import { describe, announce } from './a11y.js';
import { enableExplore } from './explore.js';

const STEP = 0.25;      // analyse every 0.25 s of media time
const SCAN_SECONDS = 8; // one west → east sweep in Scan mode

let video, canvas, ctx, message;
let cfg = null;
let mode = 'play';
let playing = false;
let missing = false;       // video file not found → simulated clock so sound still works
let lastT = -Infinity;
let simStart = 0, simOffset = 0;
let rafId = null, vfcId = null;
let disableExplore = null;

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

/** Pause playback and silence all notes. */
export function pause() {
  if (!video) return;
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
  canvas.classList.toggle('scanning', m === 'scan');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (m === 'explore' && cfg) disableExplore = enableExplore(canvas, cfg);
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
  if (mode === 'scan') drawScanLine(t);
  if (t - lastT < STEP && t >= lastT) return;
  lastT = t;

  // No video file yet: ask the analyser for sample data explicitly so the dataset still sounds.
  const features = analyze(video, cfg, { fake: missing });
  playFrame(features, cfg, t);
  describe(features, cfg, t);
  // TODO(Freia): in Scan mode, play features.columns[scanColumn] as a chord instead.
}

function drawScanLine(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (reducedMotion.matches) return;
  const x = ((t % SCAN_SECONDS) / SCAN_SECONDS) * canvas.width;
  ctx.fillStyle = 'rgba(255, 210, 63, 0.9)';
  ctx.fillRect(x - 1.5, 0, 3, canvas.height);
}
