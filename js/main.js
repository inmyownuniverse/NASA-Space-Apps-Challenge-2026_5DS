import { analyze, resetAnalyzer } from './analyzer.js';
import { demoFeatures } from './sound/demo.js';
import { tuned } from './sound/tuning.js';
import { initLanding } from './landing.js';
import { initAudio, loadDataset, releaseAll, setVolume, playLegendSample, loadSymphony, playSymphonyFrame, setSymphonyLevel } from './sound/engine.js';
import * as player from './player.js';
import { announce, speak, speakAndWait, formatTime } from './a11y.js';
import { setEyesClosed } from './eyes.js';
import { startRecording, stopRecording, isRecording } from './sound/export.js';
import { fixtures, modeCopy } from './presentation.js';

const byId = (id) => document.getElementById(id);
const symphony = { elapsed: 0, running: false, duration: 0 };
const state = { view: 'home', mode: 'play' };
let datasets = [];
let dataset;
let legendRun = 0;
const legendHeard = new Set();
let muted = false;

async function ensureAudio() {
  await initAudio();
  onVolume();
}

function mediaSurface(container, data) {
  const image = document.createElement('img');
  image.alt = data.title + ' visualization';
  if (data.preview) image.src = data.preview;
  container.replaceChildren(image);
}

function renderLibrary() {
  byId('datasets').replaceChildren(...datasets.map((data, index) => {
    const entry = document.createElement('li');
    const button = document.createElement('button');
    button.style.setProperty('--track', data.accent);
    button.dataset.dataset = data.id;
    button.innerHTML = '<span class="track-dot" aria-hidden="true"></span><span class="track-copy"><strong></strong><small></small><span></span></span>';
    const number = document.createElement('span');
    number.className = 'track-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1).padStart(2, '0');
    const thumbnail = document.createElement('img');
    thumbnail.className = 'track-thumbnail';
    thumbnail.alt = '';
    if (data.preview) thumbnail.src = data.preview;
    button.prepend(number, thumbnail);
    button.querySelector('strong').textContent = data.title;
    button.querySelector('small').textContent = data.dates;
    button.querySelector('.track-copy > span').textContent = data.description;
    button.addEventListener('click', () => selectDataset(data));
    entry.append(button);
    return entry;
  }));
}

function selectDataset(data) {
  dataset = data;
  legendRun++;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  document.documentElement.style.setProperty('--accent', data.accent);
  document.querySelectorAll('[data-dataset]').forEach((button) => {
    button.setAttribute('aria-current', String(button.dataset.dataset === data.id));
  });
  byId('dataset-title').textContent = data.title;
  byId('dataset-dates').textContent = data.dates;
  byId('description').textContent = data.description;
  byId('play-summary-title').textContent = data.title;
  byId('play-summary-dates').textContent = data.dates;
  byId('play-summary-description').textContent = data.description;
  const scale = byId('legend-scale');
  scale.hidden = data.id !== 'sst' || !data.colorbar?.stops?.length;
  if (!scale.hidden) {
    const colors = data.colorbar.stops.map(({ rgb }) => 'rgb(' + rgb.join(', ') + ')');
    scale.style.setProperty('--legend-colors', colors.join(', '));
  }
  byId('dataset-notes').disabled = false;
  byId('mapping').textContent = data.mapping;
  byId('source').hidden = !data.source;
  if (data.source) byId('source').href = data.source;
  byId('legend').replaceChildren(...data.legend.map(({ sound, means }) => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = sound;
    item.append(label, document.createTextNode(means));
    return item;
  }));
  const video = byId('video');
  video.poster = data.preview ?? '';
  byId('readout-value').textContent = 'Ready';
  loadDataset(data);
  player.load(data);

  updateTime();
  announce(data.title + ' selected');
}

const layers = new Map();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let mixRun = 0;
let mixTick = 0;
let recordingName = '';

function seekMix(time) {
  symphony.elapsed = time;
  resetAnalyzer();
  releaseAll();
  for (const { video } of layers.values()) {
    if (video.readyState >= 1) video.currentTime = Math.min(time, video.duration);
  }
  updateControls();
}

function stopMix() {
  mixRun++;
  if (!symphony.running) return;
  symphony.running = false;
  for (const { video } of layers.values()) video.pause();
  if (dataset) loadDataset(dataset);
  resetAnalyzer();
  updateControls();
}

async function toggleMix() {
  if (!layers.size) return;
  if (symphony.running) { stopMix(); return; }
  const run = ++mixRun;
  await ensureAudio();
  if (run !== mixRun || state.view !== 'symphony') return;
  if (symphony.elapsed >= symphony.duration) seekMix(0);
  player.pause();
  loadSymphony(datasets);
  resetAnalyzer();
  symphony.running = true;
  for (const [id, { video, level }] of layers) {
    setSymphonyLevel(id, Number(level.value));
    if (!motion.matches && !video.error) video.play().catch(() => {});
  }
  mixTick = 0;
  updateControls();
  announce('Planet Symphony playing. Tiles identify analyzed video and sample layers.');
}

function buildMixControls() {
  const container = byId('symphony-controls');
  container.innerHTML = '<div class="transport"><button class="primary" data-action="toggle">Play Symphony</button><label class="timeline">Timeline<input type="range" data-mix-time min="0" max="1" step="0.1" value="0"></label><output></output></div><button data-mix-record>Record mix</button>';
  container.querySelector('[data-action="toggle"]').addEventListener('click', toggleMix);
  container.querySelector('[data-mix-time]').addEventListener('input', (e) => seekMix(Number(e.target.value)));
  container.querySelector('[data-mix-record]').addEventListener('click', toggleRecord);
}

function updateControls() {
  const container = byId('symphony-controls');
  container.querySelector('[data-action="toggle"]').textContent = symphony.running ? 'Pause Symphony' : 'Play Symphony';
  const timeline = container.querySelector('[data-mix-time]');
  timeline.max = symphony.duration || 1;
  timeline.value = symphony.elapsed;
  const time = formatTime(symphony.elapsed) + ' / ' + formatTime(symphony.duration);
  timeline.setAttribute('aria-valuetext', time);
  container.querySelector('output').textContent = time;
}

const routes = ['home', 'play', 'scan', 'explore', 'symphony'];
const landing = initLanding();

function navigate() {
  const requested = location.hash.slice(1);
  const route = routes.includes(requested) ? requested : 'home';
  state.view = route === 'home' || route === 'symphony' ? route : 'jukebox';
  if (state.view === 'jukebox') state.mode = route;
  legendRun++;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  player.pause();
  if (dataset) player.setMode(state.view === 'jukebox' && state.mode === 'explore' ? 'explore' : 'play');
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
  });
  byId('instruction').textContent = modeCopy[state.mode];
  byId('readout-heading').textContent = state.mode === 'explore' ? 'Selected location' : 'Live readout';
  stopMix();
  byId('home').hidden = route !== 'home';
  byId('home-details').hidden = route !== 'home';
  document.body.classList.toggle('home-active', route === 'home');
  document.body.classList.toggle('jukebox-active', state.view === 'jukebox');
  document.body.classList.toggle('play-console', route !== 'home');
  document.body.dataset.studioView = route;
  const modeLabel = document.querySelector('.play-heading > .eyebrow');
  if (state.view === 'jukebox') modeLabel.textContent = 'Earth observation · ' + route;
  playNotes.forEach((note) => {
    note.classList.remove('note-visible');
    noteObserver.unobserve(note);
    if (state.view === 'jukebox') noteObserver.observe(note);
  });
  byId('legend-button').removeAttribute('aria-haspopup');
  if (route === 'play') byId('legend-button').setAttribute('aria-haspopup', 'dialog');
  if (route !== 'play' && byId('play-dialog').open) byId('play-dialog').close();
  document.querySelector('.play-summary').hidden = state.view !== 'jukebox';
  byId('jukebox').hidden = state.view !== 'jukebox';
  byId('symphony').hidden = route !== 'symphony';
  document.querySelectorAll('#site-navigation a').forEach((link) => {
    if (link.hash === '#' + route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  landing.setVisible(route === 'home');
  updateTime();
  updateControls();
}

document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => { location.hash = button.dataset.mode; });
});

window.addEventListener('hashchange', () => {
  const previousFocus = document.activeElement;
  navigate();
  window.scrollTo(0, 0);
  if (previousFocus?.closest('#main [hidden]')) byId('main').focus();
});

const playDialog = byId('play-dialog');

function showPlayDialog(title, ...content) {
  byId('play-dialog-title').textContent = title;
  byId('play-dialog-content').replaceChildren(...content);
  playDialog.showModal();
}

byId('dataset-notes').addEventListener('click', () => {
  const description = document.createElement('p');
  description.textContent = dataset.description;
  const dates = document.createElement('p');
  dates.className = 'eyebrow';
  dates.textContent = dataset.dates;
  const source = byId('source').cloneNode(true);
  source.removeAttribute('id');
  showPlayDialog(dataset.title, dates, description, source);
});

let recordingBusy = false;
async function toggleRecord() {
  if (recordingBusy) return;
  if (!dataset) { announce('Choose a dataset first.'); return; }
  recordingBusy = true;
  try {
    await ensureAudio();
    if (isRecording()) {
      const blob = await stopRecording(recordingName);
      announce(blob?.type === 'audio/wav' ? 'WAV recording saved.' : 'Recording saved in the browser capture format.');
    } else {
      recordingName = state.view === 'symphony' ? 'planet-symphony' : dataset.id + '-earth-jukebox';
      await startRecording();
      announce('Recording started.');
    }
  } catch (error) {
    console.error(error);
    announce('Recording unavailable.');
  } finally {
    recordingBusy = false;
  }
  const active = isRecording();
  byId('record-btn').textContent = active ? 'Stop and download' : 'Record track';
  document.querySelector('[data-mix-record]').textContent = active ? 'Stop and download' : 'Record mix';
  for (const button of [byId('record-btn'), document.querySelector('[data-mix-record]')]) {
    button.setAttribute('aria-pressed', String(active));
  }
}

let eyesClosed = false;
function toggleEyes() {
  eyesClosed = !eyesClosed;
  byId('eyes-btn').setAttribute('aria-pressed', String(eyesClosed));
  setEyesClosed(eyesClosed, {
    getFeatures: player.latestFeatures,
    getCfg: () => dataset,
    isPlaying: player.isPlaying,
  });
  // Turning on, eyes.js speaks its own introduction and the first summary.
  if (!eyesClosed) speak('Eyes-closed mode off.');
  announce(eyesClosed ? 'Eyes-closed mode on. Summaries are spoken every 8 seconds. Press E to turn it off.' : 'Eyes-closed mode off.');
}

function scrubBy(dt) {
  player.seek(player.currentTime() + dt);
  updateTime();
}

function changeVolume(delta) {
  const v = byId('volume');
  v.value = Math.min(Number(v.max), Math.max(Number(v.min), Number(v.value) + delta));
  onVolume();
  announce(`Volume ${v.value} decibels`);
}

function onVolume() {
  const v = byId('volume');
  v.setAttribute('aria-valuetext', `${v.value} decibels`);
  setVolume(muted ? -60 : Number(v.value));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sonic legend: speak each legend line, then play its example sound.
 * @returns {Promise<boolean>} true if it played to the end, false if it was stopped
 */
async function playLegend() {
  if (!dataset) { announce('Choose a dataset first.'); return false; }
  await ensureAudio();
  if (player.isScanning()) player.setMode('play');
  if (player.isPlaying()) { player.pause(); updateTime(); }
  const run = ++legendRun;
  const cfg = dataset;
  const items = [...document.querySelectorAll('#legend li, #play-dialog-content li')];
  const stopped = () => run !== legendRun || cfg !== dataset;

  legendHeard.add(cfg.id); // heard or skipped: either way, don't force it again
  await speakAndWait(`Legend for ${cfg.title}. Press Escape to skip.`);
  for (let i = 0; i < cfg.legend.length; i++) {
    if (stopped()) break;
    items.forEach((li, k) => li.classList.toggle('speaking', k % cfg.legend.length === i));
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
  speak(byId('readout').textContent);
}

function stopAll() {
  legendRun++; // cancels a legend that is playing
  player.pause();
  releaseAll();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  updateTime();
  announce('Stopped');
}

function updateTime() {
  const button = byId('play-btn');
  button.textContent = player.isScanning() ? 'Stop scan' : state.mode === 'scan' ? 'Start scan' : player.isPlaying() ? 'Pause' : 'Play';
  button.dataset.playing = String(player.isPlaying());
  const t = player.currentTime();
  const d = player.duration();
  const scrub = byId('scrub');
  scrub.max = d || 100;
  scrub.value = t;
  const text = `${formatTime(t)} of ${formatTime(d)}`;
  scrub.setAttribute('aria-valuetext', text);
  byId('time').textContent = `${formatTime(t)} / ${formatTime(d)}`;
}


async function togglePlay() {
  if (!dataset) return;
  await ensureAudio();
  if (player.isScanning()) player.setMode('play');
  else if (player.isPlaying()) player.pause();
  else if (state.mode === 'scan') player.setMode('scan');
  else {
    const selected = dataset;
    if (byId('legend-first').checked && !legendHeard.has(selected.id) && !await playLegend()) return;
    if (dataset !== selected || state.view !== 'jukebox') return;
    await player.play();
  }
  updateTime();
}

byId('play-btn').addEventListener('click', togglePlay);
byId('scrub').addEventListener('input', (event) => { if (dataset) player.seek(Number(event.target.value)); updateTime(); });
byId('volume').addEventListener('input', onVolume);
byId('mute-btn').addEventListener('click', (event) => {
  muted = !muted;
  event.currentTarget.textContent = muted ? 'Unmute' : 'Mute';
  event.currentTarget.setAttribute('aria-pressed', String(muted));
  onVolume();
});
byId('share-btn').addEventListener('click', async () => {
  if (!dataset) return;
  const url = new URL(location.href);
  url.search = new URLSearchParams({ dataset: dataset.id, t: Math.floor(player.currentTime()), mode: state.mode });
  try { await navigator.clipboard.writeText(url.href); announce('Link copied.'); }
  catch { announce(url.href); }
});
byId('eyes-btn').addEventListener('click', toggleEyes);
byId('record-btn').addEventListener('click', toggleRecord);
byId('video').addEventListener('loadedmetadata', updateTime);
byId('video').addEventListener('timeupdate', updateTime);
byId('video').addEventListener('ended', updateTime);
playDialog.addEventListener('close', () => {
  if (byId('play-dialog-title').textContent === 'Sonic legend') stopAll();
});
byId('legend-button').addEventListener('click', () => {
  if (!dataset) return;
  if (state.mode === 'play') {
    const legend = byId('legend').cloneNode(true);
    legend.removeAttribute('id');
    showPlayDialog('Sonic legend', legend);
  }
  playLegend();
});

const MODES = ['play', 'scan', 'explore'];
const SCRUB_STEP = 5;
const VOLUME_STEP = 2;
function onKey(e) {
  if (state.view !== 'jukebox' || !dataset || playDialog.open || e.defaultPrevented) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key !== 'Escape') return; // let sliders use their own arrow keys
  }

  switch (e.key) {
    case ' ':
      if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A') return; // Space activates the focused button
      e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': e.preventDefault(); scrubBy(-SCRUB_STEP); break;
    case 'ArrowRight': e.preventDefault(); scrubBy(SCRUB_STEP); break;
    case 'ArrowUp': e.preventDefault(); changeVolume(VOLUME_STEP); break;
    case 'ArrowDown': e.preventDefault(); changeVolume(-VOLUME_STEP); break;
    case '1': case '2': case '3': case '4': selectDataset(datasets[Number(e.key) - 1]); break;
    case 'm': case 'M': location.hash = MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]; break;
    case 'l': case 'L': playLegend(); break;
    case 'd': case 'D': describeNow(); break;
    case 'e': case 'E': toggleEyes(); break;
    case 'r': case 'R': toggleRecord(); break;
    case 'Escape': stopAll(); break;
    default: return;
  }
}

document.addEventListener('keydown', onKey);

function renderTiles() {
  byId('tiles').replaceChildren(...datasets.map((data) => {
    const tile = document.createElement('article');
    tile.className = 'panel tile';
    tile.dataset.datasetId = data.id;
    tile.innerHTML = '<div class="stage media"></div><div class="tile-copy"><h4></h4><p></p></div>';
    tile.querySelector('h4').textContent = data.title;
    tile.querySelector('p').textContent = data.instrument ?? '';
    tile.style.setProperty('--track', data.accent);
    const surface = tile.querySelector('.media');
    mediaSurface(surface, data);
    const poster = surface.querySelector('img');
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.hidden = true;
    const status = document.createElement('span');
    status.className = 'media-state';
    status.textContent = 'Loading data';
    video.addEventListener('loadeddata', () => {
      status.textContent = 'Analyzed video';
      if (!motion.matches) { poster.hidden = true; video.hidden = false; }
    });
    video.addEventListener('error', () => {
      status.textContent = 'Sample data';
      video.hidden = true;
      poster.hidden = false;
    });
    surface.append(video, status);
    video.src = data.video;
    const label = document.createElement('label');
    label.textContent = 'Layer level ';
    const level = document.createElement('input');
    level.type = 'range';
    level.min = '-40';
    level.max = '6';
    level.value = tuned(data).sound.symphonyLevel ?? -6;
    level.setAttribute('aria-label', data.title + ' layer level');
    const applyLevel = () => {
      level.setAttribute('aria-valuetext', level.value + ' decibels');
      setSymphonyLevel(data.id, Number(level.value));
    };
    applyLevel();
    level.addEventListener('input', applyLevel);
    label.append(level);
    tile.querySelector('.tile-copy').append(label);
    video.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(video.duration)) symphony.duration = Math.max(symphony.duration, video.duration);
      updateControls();
    });
    layers.set(data.id, { video, level });
    return tile;
  }));
}

buildMixControls();
motion.addEventListener('change', stopMix);
document.addEventListener('keydown', (event) => {
  if (state.view !== 'symphony' || event.defaultPrevented) return;
  if (event.key === 'Escape') {
    stopMix();
    return;
  }
  if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (event.target.closest('button, a, input, select, textarea, summary, [contenteditable]')) return;
  event.preventDefault();
  if (!event.repeat) toggleMix();
});

let lastTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (state.view === 'jukebox' && dataset) updateTime();
  if (symphony.running) {
    symphony.elapsed = Math.min(symphony.duration, symphony.elapsed + (now - lastTick) / 1000);
    if (now >= mixTick) {
      const frames = {};
      for (const data of datasets) {
        const { video } = layers.get(data.id);
        if (video.error) frames[data.id] = demoFeatures(data, symphony.elapsed);
        else if (video.readyState >= 2 && !video.seeking && symphony.elapsed <= video.duration) {
          frames[data.id] = analyze(video, data);
          if (motion.matches && symphony.elapsed < video.duration) video.currentTime = symphony.elapsed;
        }
      }
      playSymphonyFrame(frames);
      mixTick = now + 250;
    }
    if (symphony.elapsed >= symphony.duration) { stopMix(); announce('Planet Symphony complete.'); }
    updateControls();
  }
  lastTick = now;
}, 100);

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ' returned ' + response.status);
  return response.json();
}

function renderShowcase() {
  byId('showcase-cards').replaceChildren(...datasets.map((data) => {
    const item = document.createElement('li');
    const card = document.createElement('a');
    card.href = '#play';
    card.style.setProperty('--card-accent', data.accent);
    const image = document.createElement('img');
    image.src = data.preview;
    image.alt = '';
    image.loading = 'lazy';
    const name = document.createElement('strong');
    name.textContent = data.title;
    card.append(image, name);
    card.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      selectDataset(data);
    });
    item.append(card);
    return item;
  }));
}

async function start() {
  const files = await json('datasets/index.json');
  datasets = await Promise.all(files.map(async (file) => {
    const config = await json('datasets/' + file);
    return {
      ...fixtures[config.id], ...config,
      dates: config.dates && !/^TODO/i.test(config.dates) ? config.dates : fixtures[config.id]?.dates ?? 'Dates unavailable',
    };
  }));
  symphony.duration = Math.max(...datasets.map(({ duration }) => duration));
  renderLibrary();
  renderShowcase();
  renderTiles();
  const params = new URLSearchParams(location.search);
  const id = params.get('dataset');
  const requested = datasets.find((item, index) => item.id === id || String(index + 1) === id);
  selectDataset(requested ?? datasets[0]);
  if (requested) {
    if (!location.hash) location.hash = MODES.includes(params.get('mode')) ? params.get('mode') : 'play';
    const time = Number(params.get('t'));
    if (time > 0) {
      const abort = new AbortController();
      const seek = () => {
        abort.abort();
        if (dataset === requested) { player.seek(time); updateTime(); }
      };
      for (const event of ['loadedmetadata', 'error']) {
        byId('video').addEventListener(event, seek, { signal: abort.signal });
      }
    }
  }
}

const playNotes = document.querySelectorAll('#jukebox .details > :not(:first-child)');
const noteObserver = new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => {
    target.classList.toggle('note-visible', isIntersecting && document.body.classList.contains('play-console'));
  });
}, { threshold: 0.15 });

navigate();

start().catch((error) => {
  byId('datasets').textContent = 'Datasets unavailable. Serve this directory over HTTP to load the previews.';
  console.error(error);
});
