// Owner: Hazel · Support: Celene
// App entry: loads dataset configs, builds the jukebox list, wires controls and shortcuts.

import { initAudio, loadDataset, releaseAll, setVolume, playLegendSample } from './sound/engine.js';
import * as player from './player.js';
import { announce, speak, speakAndWait, formatTime } from './a11y.js';
import { setEyesClosed } from './eyes.js';
import { startRecording, stopRecording, isRecording } from './sound/export.js';

const MODES = ['play', 'scan', 'explore'];
const SCRUB_STEP = 5;   // seconds for ←/→
const VOLUME_STEP = 2;  // dB for ↑/↓

let datasets = [];
let current = null;
let mode = 'play';
let legendRun = 0;             // bumped to cancel a legend that is playing
const legendHeard = new Set(); // dataset ids whose legend was heard (for "legend first")

const $ = (id) => document.getElementById(id);

// ---- audio unlock: browsers only allow sound after a user gesture ----
let pendingMode = null; // mode from a shared link, applied on the first click or key press

/** @returns {Promise<boolean>} true if this call switched to a mode from a shared link */
async function ensureAudio() {
  await initAudio();
  setVolume(Number($('volume').value));
  if (!pendingMode) return false;
  const m = pendingMode;
  pendingMode = null;
  await setMode(m);
  return true;
}
window.addEventListener('pointerdown', ensureAudio, { once: true });
window.addEventListener('keydown', ensureAudio, { once: true });

// ---- datasets ----
async function loadDatasets() {
  const files = await (await fetch('datasets/index.json')).json();
  datasets = await Promise.all(files.map(async (f) => (await fetch(`datasets/${f}`)).json()));
  buildList();
  applyUrl();
}

function buildList() {
  const list = $('dataset-list');
  list.innerHTML = '';
  datasets.forEach((cfg, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.index = i;
    btn.setAttribute('aria-current', 'false');
    btn.innerHTML = `<span class="key" aria-hidden="true">${i + 1}</span>`;
    btn.append(cfg.title);
    btn.addEventListener('click', () => selectDataset(i));
    li.append(btn);
    list.append(li);
  });
  // TODO(Hazel): add a "Planet Symphony" entry that layers all four datasets at once.
}

function selectDataset(i) {
  const cfg = datasets[i];
  if (!cfg) return;
  current = cfg;

  document.querySelectorAll('#dataset-list button').forEach((b) => {
    b.setAttribute('aria-current', String(Number(b.dataset.index) === i));
  });
  $('now-playing').textContent = cfg.title;
  $('description').textContent = cfg.description;
  $('legend').innerHTML = cfg.legend.map((l) => `<li><strong>${l.sound}</strong>: ${l.means}</li>`).join('');
  $('mapping').textContent = mappingText(cfg);
  $('readout').textContent = '—';

  loadDataset(cfg); // before player.load, so Scan mode can start on the new dataset
  player.load(cfg);
  updatePlayButton();
  updateUrl();
  announce(`${cfg.title} selected. Press Space to play, or L to hear the legend.`);
}

function mappingText(cfg) {
  // TODO(Celene): replace with a hand-written explanation per dataset (could live in the config).
  const s = cfg.sound;
  return `Each frame is split into a ${cfg.grid.w} by ${cfg.grid.h} grid. Colours are turned back into ` +
    `${cfg.colorbar.unit} using the colorbar, then mapped to ${s.valueTo} on a ${s.instrument ?? s.instruments?.join(', ')} ` +
    `sound in ${s.scale}.`;
}

// ---- controls ----
async function togglePlay() {
  if (!current) { announce('Choose a dataset first.'); return; }
  if (await ensureAudio()) return; // the first key press started the shared link's mode
  if (player.isPlaying()) {
    player.pause();
    announce('Paused');
    updateUrl();
  } else {
    if (mode === 'scan') await setMode('play'); // Play leaves Scan mode and plays the video again
    if ($('legend-first').checked && !legendHeard.has(current.id)) {
      const cfg = current;
      const finished = await playLegend();
      if (!finished || cfg !== current) { updatePlayButton(); return; }
    }
    await player.play();
  }
  updatePlayButton();
}

function updatePlayButton() {
  const btn = $('play-btn');
  const label = player.isPlaying() ? 'Pause' : 'Play';
  btn.textContent = label;
  btn.setAttribute('aria-label', label);
}

async function setMode(m) {
  await ensureAudio(); // Scan mode makes sound straight away
  mode = m;
  document.querySelectorAll('.mode-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  player.setMode(m);
  announce(`${m[0].toUpperCase()}${m.slice(1)} mode`);
  updateUrl();
}

// ---- shareable links: ?dataset=sst&t=30&mode=scan ----
let urlLocked = false; // true while a shared link is being applied

function updateUrl() {
  if (!current || urlLocked) return;
  const p = new URLSearchParams({ dataset: current.id });
  const t = Math.floor(player.currentTime());
  if (t > 0) p.set('t', t);
  const m = pendingMode ?? mode;
  if (m !== 'play') p.set('mode', m);
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

async function copyLink() {
  updateUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    announce('Link to this moment copied.');
  } catch {
    announce(`Copy this link: ${location.href}`);
  }
}

/** Open the dataset, time and mode named in the address, if any. */
function applyUrl() {
  const p = new URLSearchParams(location.search);
  const id = p.get('dataset');
  if (!id) return;
  const i = datasets.findIndex((d) => d.id === id || String(datasets.indexOf(d) + 1) === id);
  if (i < 0) { announce(`No dataset called ${id}.`); return; }
  urlLocked = true;
  selectDataset(i);
  const t = Number(p.get('t'));
  if (!(t > 0)) urlLocked = false;
  if (t > 0) {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      player.seek(t);
      updateTime();
      urlLocked = false;
    };
    $('video').addEventListener('loadedmetadata', go, { once: true });
    setTimeout(go, 1500); // video missing: the simulated clock can seek straight away
  }
  const m = p.get('mode');
  if (MODES.includes(m) && m !== 'play') {
    pendingMode = m;
    document.querySelectorAll('.mode-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    announce(`${current.title} opened from a link in ${m} mode. Press any key or click to start.`);
  }
}

async function toggleRecord() {
  if (!current) { announce('Choose a dataset first.'); return; }
  await ensureAudio();
  const btn = $('record-btn');
  if (isRecording()) {
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = 'Record track';
    await stopRecording(`${current.id}-earth-jukebox`);
    announce('Recording stopped. Your track is downloading.');
  } else {
    await startRecording();
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = 'Stop and download';
    announce('Recording. Press R or the button again to stop and download the track.');
  }
}

let eyesClosed = false;
function toggleEyes() {
  eyesClosed = !eyesClosed;
  $('eyes-btn').setAttribute('aria-pressed', String(eyesClosed));
  setEyesClosed(eyesClosed, {
    getFeatures: player.latestFeatures,
    getCfg: () => current,
    isPlaying: player.isPlaying,
  });
  const text = eyesClosed
    ? 'Eyes-closed mode on. The picture is hidden and a short summary is spoken every 8 seconds. Press E to turn it off.'
    : 'Eyes-closed mode off.';
  speak(text);
  announce(text);
}

function scrubBy(dt) {
  player.seek(player.currentTime() + dt);
  updateTime();
  updateUrl();
}

function changeVolume(delta) {
  const v = $('volume');
  v.value = Math.min(Number(v.max), Math.max(Number(v.min), Number(v.value) + delta));
  onVolume();
  announce(`Volume ${v.value} decibels`);
}

function onVolume() {
  const v = $('volume');
  v.setAttribute('aria-valuetext', `${v.value} decibels`);
  setVolume(Number(v.value));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sonic legend: speak each legend line, then play its example sound.
 * @returns {Promise<boolean>} true if it played to the end, false if it was stopped
 */
async function playLegend() {
  if (!current) { announce('Choose a dataset first.'); return false; }
  await ensureAudio();
  if (player.isPlaying()) { player.pause(); updatePlayButton(); }
  const run = ++legendRun;
  const cfg = current;
  const items = [...document.querySelectorAll('#legend li')];
  const stopped = () => run !== legendRun || cfg !== current;

  legendHeard.add(cfg.id); // heard or skipped: either way, don't force it again
  await speakAndWait(`Legend for ${cfg.title}. Press Escape to skip.`);
  for (let i = 0; i < cfg.legend.length; i++) {
    if (stopped()) break;
    items.forEach((li, k) => li.classList.toggle('speaking', k === i));
    await speakAndWait(`${cfg.legend[i].sound} means ${cfg.legend[i].means}.`);
    if (stopped()) break;
    playLegendSample(cfg, i);
    await wait(2200);
  }
  items.forEach((li) => li.classList.remove('speaking'));
  if (stopped()) return false;
  releaseAll();
  return true;
}

function describeNow() {
  speak($('readout').textContent);
}

function stopAll() {
  legendRun++; // cancels a legend that is playing
  player.pause();
  releaseAll();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  updatePlayButton();
  announce('Stopped');
}

function updateTime() {
  const t = player.currentTime();
  const d = player.duration();
  const scrub = $('scrub');
  scrub.max = d || 100;
  scrub.value = t;
  const text = `${formatTime(t)} of ${formatTime(d)}`;
  scrub.setAttribute('aria-valuetext', text);
  $('time').textContent = `${formatTime(t)} / ${formatTime(d)}`;
}

function wireControls() {
  $('play-btn').addEventListener('click', togglePlay);
  document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('scrub').addEventListener('input', (e) => { player.seek(Number(e.target.value)); updateTime(); });
  $('volume').addEventListener('input', onVolume);
  $('legend-btn').addEventListener('click', playLegend);
  $('share-btn').addEventListener('click', copyLink);
  $('eyes-btn').addEventListener('click', toggleEyes);
  $('record-btn').addEventListener('click', toggleRecord);
  $('video').addEventListener('timeupdate', updateTime);
  $('video').addEventListener('loadedmetadata', updateTime);
  setInterval(() => { if (player.isPlaying()) updateTime(); }, 500); // also covers the no-video clock
}

// ---- keyboard shortcuts ----
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key !== 'Escape') return; // let sliders use their own arrow keys
  }

  switch (e.key) {
    case ' ':
      if (tag === 'BUTTON' || tag === 'SUMMARY') return; // Space activates the focused button
      e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': e.preventDefault(); scrubBy(-SCRUB_STEP); break;
    case 'ArrowRight': e.preventDefault(); scrubBy(SCRUB_STEP); break;
    case 'ArrowUp': e.preventDefault(); changeVolume(VOLUME_STEP); break;
    case 'ArrowDown': e.preventDefault(); changeVolume(-VOLUME_STEP); break;
    case '1': case '2': case '3': case '4': selectDataset(Number(e.key) - 1); break;
    case 'm': case 'M': setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]); break;
    case 'l': case 'L': playLegend(); break;
    case 'd': case 'D': describeNow(); break;
    case 'e': case 'E': toggleEyes(); break;
    case 'r': case 'R': toggleRecord(); break;
    case 'Escape': stopAll(); break;
    default: return;
  }
}

// ---- start ----
wireControls();
document.addEventListener('keydown', onKey);
loadDatasets().catch((err) => {
  console.error('Could not load datasets', err);
  $('dataset-list').innerHTML = '<li>Could not load datasets. Serve this folder over http (e.g. Live Server), not file://.</li>';
});
