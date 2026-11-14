// Owner: Hazel · Support: Celene
// App entry: loads dataset configs, builds the jukebox list, wires controls and shortcuts.

import { initAudio, loadDataset, releaseAll, setVolume } from './sound/engine.js';
import * as player from './player.js';
import { announce, speak, formatTime } from './a11y.js';

const MODES = ['play', 'scan', 'explore'];
const SCRUB_STEP = 5;   // seconds for ←/→
const VOLUME_STEP = 2;  // dB for ↑/↓

let datasets = [];
let current = null;
let mode = 'play';

const $ = (id) => document.getElementById(id);

// ---- audio unlock: browsers only allow sound after a user gesture ----
async function ensureAudio() {
  await initAudio();
  setVolume(Number($('volume').value));
}
window.addEventListener('pointerdown', ensureAudio, { once: true });
window.addEventListener('keydown', ensureAudio, { once: true });

// ---- datasets ----
async function loadDatasets() {
  const files = await (await fetch('datasets/index.json')).json();
  datasets = await Promise.all(files.map(async (f) => (await fetch(`datasets/${f}`)).json()));
  buildList();
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
  announce(`${cfg.title} selected. Press Space to play.`);
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
  await ensureAudio();
  if (player.isPlaying()) {
    player.pause();
    announce('Paused');
  } else {
    if (mode === 'scan') await setMode('play'); // Play leaves Scan mode and plays the video again
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
}

function scrubBy(dt) {
  player.seek(player.currentTime() + dt);
  updateTime();
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

function playLegend() {
  if (!current) { announce('Choose a dataset first.'); return; }
  const text = current.legend.map((l) => `${l.sound} means ${l.means}`).join('. ');
  speak(text);
  announce(text);
  // TODO(Freia): play an example of each sound while its line is spoken.
}

function describeNow() {
  speak($('readout').textContent);
}

function stopAll() {
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
