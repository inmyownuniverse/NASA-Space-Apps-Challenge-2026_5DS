import { initLanding } from './landing.js';
import { formatTime } from './a11y.js';
import { fixtures, modeCopy } from './presentation.js';

const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clock = () => ({ elapsed: 0, running: false, duration: 0 });
const player = clock();
const symphony = clock();
const state = { view: 'home', mode: 'play', volume: 75, muted: false, cell: null };
let datasets = [];
let dataset;
let mediaState = 'loading';

function announce(message) {
  byId('status').textContent = message;
}

function mediaSurface(container, data, video = false) {
  container.replaceChildren();
  const message = document.createElement('span');
  message.className = 'media-state';
  const show = (status) => {
    container.dataset.state = status;
    message.textContent = status === 'loading' ? 'Loading visualization…'
      : status === 'missing' ? (video ? 'Video not found' : 'Preview unavailable') : 'NASA preview';
    if (video) mediaState = status;
  };
  show('loading');
  const image = document.createElement('img');
  image.alt = data.title + ' visualization';
  image.addEventListener('load', () => {
    if (!video || !data.video) show(video ? 'missing' : 'ready');
  });
  image.addEventListener('error', () => {
    image.hidden = true;
    if (!video || !data.video) show('missing');
  });
  if (data.preview) image.src = data.preview;
  else {
    image.hidden = true;
    if (!video || !data.video) show('missing');
  }
  container.append(image, message);
  if (!video || !data.video) return;
  const clip = document.createElement('video');
  clip.preload = 'metadata';
  clip.muted = true;
  clip.playsInline = true;
  clip.hidden = true;
  clip.addEventListener('loadedmetadata', () => {
    if (clip.isConnected) {
      if (state.mode === 'play' && Number.isFinite(clip.duration)) player.duration = clip.duration;
      show('ready');
      renderMode();
      updateControls();
    }
  });
  clip.addEventListener('error', () => {
    if (clip.isConnected) show('missing');
  });
  container.prepend(clip);
  clip.src = data.video;
}

function renderLibrary() {
  byId('datasets').replaceChildren(...datasets.map((data) => {
    const entry = document.createElement('li');
    const button = document.createElement('button');
    button.style.setProperty('--track', data.accent);
    button.dataset.dataset = data.id;
    button.innerHTML = '<span class="track-dot" aria-hidden="true"></span><span class="track-copy"><strong></strong><small></small><span></span></span>';
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
  Object.assign(player, clock(), { duration: state.mode === 'scan' ? 12 : data.duration });
  state.cell = null;
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
  byId('dataset-notes').disabled = false;
  byId('mapping').textContent = data.mapping;
  byId('source').hidden = !data.source;
  if (data.source) byId('source').href = data.source;
  byId('legend-preview').hidden = true;
  byId('legend-button').setAttribute('aria-expanded', 'false');
  byId('legend').replaceChildren(...data.legend.map(({ sound, means }) => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = sound;
    item.append(label, document.createTextNode(means));
    return item;
  }));
  mediaSurface(byId('media'), data, true);
  renderMode();
  announce(data.title + ' selected');
}

function renderReadout() {
  const explore = state.mode === 'explore';
  const cell = state.cell;
  const sample = explore ? dataset.cells?.[cell?.join(',')] : dataset.readout;
  const available = sample?.value != null;
  const card = byId('readout');
  card.innerHTML = '<h3></h3><p class="eyebrow"></p><strong class="measurement"></strong><p class="measurement-detail"></p>';
  card.querySelector('h3').textContent = explore ? 'Selected location' : 'Live readout';
  card.querySelector('.eyebrow').textContent = 'Preview data';
  const unit = sample?.unit ?? (explore ? dataset.colorbar?.unit : '');
  card.querySelector('.measurement').textContent = available
    ? [sample.value, unit].filter((part) => part !== '' && part != null).join(' ')
    : explore && !cell ? 'Choose a cell' : 'Unavailable';
  card.querySelector('.measurement-detail').textContent = explore && cell
    ? [sample?.location ?? ('Column ' + (cell[0] + 1) + ' · Row ' + (cell[1] + 1)), sample?.hotspot ? 'Hotspot' : ''].filter(Boolean).join(' · ')
    : sample?.timestamp ?? sample?.label ?? '';
  if (!explore && sample?.timestamp && sample.label) {
    card.querySelector('.measurement-detail').textContent = sample.label + ' · ' + sample.timestamp;
  }
}

function renderMode() {
  const explore = state.mode === 'explore';
  const scan = state.mode === 'scan';
  const clip = byId('media').querySelector('video');
  const image = byId('media').querySelector('img');
  if (clip && mediaState === 'ready') {
    clip.hidden = state.mode !== 'play';
    image.hidden = !clip.hidden || !image.getAttribute('src') || (image.complete && !image.naturalWidth);
  }
  stage.classList.toggle('exploring', explore);
  if (explore) {
    stage.tabIndex = 0;
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', 'Explore map');
    stage.setAttribute('aria-describedby', 'instruction');
  } else {
    ['tabindex', 'role', 'aria-label', 'aria-describedby'].forEach((attribute) => stage.removeAttribute(attribute));
  }
  byId('instruction').textContent = modeCopy[state.mode];
  byId('scan-line').hidden = !scan;
  const cursor = byId('cursor');
  cursor.hidden = !explore;
  const [x, y] = state.cell ?? [16, 8];
  cursor.style.left = (x + 0.5) / dataset.grid.w * 100 + '%';
  cursor.style.top = (y + 0.5) / dataset.grid.h * 100 + '%';
  cursor.classList.toggle('hotspot', Boolean(dataset.cells?.[state.cell?.join(',')]?.hotspot));
  byId('player-controls').hidden = explore;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
  });
  renderReadout();
  updateControls();
}

function buildControls(container, playback, name) {
  container.innerHTML = '<div class="transport"><button class="primary" data-action="toggle"></button><label class="timeline"><span></span><input type="range" min="0" step="0.1" value="0"></label><output></output></div><div class="volume"><button data-action="mute"></button><label>Volume <input type="range" min="0" max="100" value="75"></label></div>';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', name + ' controls');
  const toggle = container.querySelector('[data-action="toggle"]');
  const timeline = container.querySelector('.timeline input');
  const mute = container.querySelector('[data-action="mute"]');
  const volume = container.querySelector('.volume input');
  toggle.addEventListener('click', () => {
    if (playback.elapsed >= playback.duration) playback.elapsed = 0;
    playback.running = !playback.running;
    updateControls();
    announce(toggle.textContent);
  });
  timeline.addEventListener('input', () => {
    playback.elapsed = Number(timeline.value);
    updateControls();
  });
  mute.addEventListener('click', () => {
    state.muted = !state.muted;
    updateControls();
  });
  volume.addEventListener('input', () => {
    state.volume = Number(volume.value);
    state.muted = false;
    updateControls();
  });
}

function updateControls() {
  for (const [id, playback] of [['player-controls', player], ['symphony-controls', symphony]]) {
    const container = byId(id);
    const scan = playback === player && state.mode === 'scan';
    const progress = playback.duration ? playback.elapsed / playback.duration : 0;
    const complete = progress >= 1;
    const percent = Math.round(progress * 100);
    container.querySelector('[data-action="toggle"]').textContent = scan
      ? playback.running ? 'Pause scan' : complete ? 'Scan again' : playback.elapsed ? 'Resume scan' : 'Start scan'
      : playback.running ? 'Pause preview' : 'Play preview';
    const timeline = container.querySelector('.timeline input');
    timeline.max = playback.duration || 1;
    timeline.value = playback.elapsed;
    const time = formatTime(playback.elapsed) + ' / ' + formatTime(playback.duration);
    timeline.setAttribute('aria-valuetext', scan ? percent + '%' : time);
    container.querySelector('.timeline span').textContent = scan ? 'Scan progress' : 'Timeline';
    container.querySelector('output').textContent = scan
      ? (complete ? 'Complete' : playback.running ? 'Scanning' : playback.elapsed ? 'Paused' : 'Ready') + ' · ' + percent + '%'
      : time;
    const mute = container.querySelector('[data-action="mute"]');
    mute.textContent = state.muted ? 'Unmute' : 'Mute';
    container.querySelector('.volume input').value = state.volume;
    if (scan) {
      const position = reducedMotion.matches && playback.running ? 0 : Math.min(percent, 99.5);
      byId('scan-line').style.left = position + '%';
    }
  }
  const clip = byId('media').querySelector('video');
  if (clip && mediaState === 'ready' && !clip.hidden && Math.abs(clip.currentTime - player.elapsed) > 0.45) {
    clip.currentTime = player.elapsed;
  }
}

function selectCell(x, y) {
  state.cell = [Math.max(0, Math.min(dataset.grid.w - 1, x)), Math.max(0, Math.min(dataset.grid.h - 1, y))];
  renderMode();
  announce(byId('readout').textContent);
}

stage.addEventListener('click', (event) => {
  if (state.mode !== 'explore') return;
  const bounds = stage.getBoundingClientRect();
  selectCell(Math.floor((event.clientX - bounds.left) / bounds.width * dataset.grid.w),
    Math.floor((event.clientY - bounds.top) / bounds.height * dataset.grid.h));
});

stage.addEventListener('keydown', (event) => {
  const offset = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!offset || state.mode !== 'explore') return;
  event.preventDefault();
  const [x, y] = state.cell ?? [16, 8];
  selectCell(x + offset[0], y + offset[1]);
});

const routes = ['home', 'play', 'scan', 'explore', 'symphony'];
const landing = initLanding();

function navigate() {
  const requested = location.hash.slice(1);
  const route = routes.includes(requested) ? requested : 'home';
  state.view = route === 'home' || route === 'symphony' ? route : 'jukebox';
  if (state.view === 'jukebox' && state.mode !== route) {
    state.mode = route;
    const clip = byId('media').querySelector('video');
    const duration = Number.isFinite(clip?.duration) ? clip.duration : dataset?.duration;
    Object.assign(player, clock(), { duration: route === 'scan' ? 12 : duration ?? 0 });
  }
  player.running = false;
  symphony.running = false;
  byId('home').hidden = route !== 'home';
  byId('home-details').hidden = route !== 'home';
  document.body.classList.toggle('home-active', route === 'home');
  document.body.classList.toggle('jukebox-active', state.view === 'jukebox');
  document.body.classList.toggle('play-console', route === 'play');
  playNotes.forEach((note) => {
    note.classList.remove('note-visible');
    noteObserver.unobserve(note);
    if (route === 'play') noteObserver.observe(note);
  });
  byId('legend-button').removeAttribute('aria-haspopup');
  if (route === 'play') byId('legend-button').setAttribute('aria-haspopup', 'dialog');
  if (route !== 'play' && byId('play-dialog').open) byId('play-dialog').close();
  const intro = document.querySelector('.intro');
  intro.hidden = route === 'home' || route === 'play';
  document.querySelector('.play-summary').hidden = route !== 'play';
  byId('intro-heading').textContent = {
    play: 'Listen to the planet.',
    scan: 'Sweep across Earth.',
    explore: 'Explore a location.',
    symphony: 'Hear Earth together.',
  }[route] ?? 'Listen to the planet.';
  byId('jukebox').hidden = state.view !== 'jukebox';
  byId('symphony').hidden = route !== 'symphony';
  document.querySelectorAll('#site-navigation a').forEach((link) => {
    if (link.hash === '#' + route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  landing.setVisible(route === 'home');
  if (dataset && state.view === 'jukebox') renderMode();
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

byId('legend-button').addEventListener('click', () => {
  if (!dataset) return;
  if (state.view === 'jukebox' && state.mode === 'play') {
    const legend = byId('legend').cloneNode(true);
    legend.removeAttribute('id');
    showPlayDialog('Sonic legend', legend);
    return;
  }
  const preview = byId('legend-preview');
  preview.hidden = !preview.hidden;
  preview.textContent = dataset.legend.map(({ sound, means }) => sound + ' means ' + means).join('. ') + '.';
  byId('legend-button').setAttribute('aria-expanded', String(!preview.hidden));
});

function renderTiles() {
  byId('tiles').replaceChildren(...datasets.map((data) => {
    const tile = document.createElement('article');
    tile.className = 'panel tile';
    tile.dataset.datasetId = data.id;
    tile.innerHTML = '<div class="stage media"></div><div class="tile-copy"><h4></h4><p></p></div>';
    tile.querySelector('h4').textContent = data.title;
    tile.querySelector('p').textContent = data.instrument ?? '';
    tile.style.setProperty('--track', data.accent);
    mediaSurface(tile.querySelector('.media'), data);
    return tile;
  }));
}

buildControls(byId('player-controls'), player, 'Dataset preview');
buildControls(byId('symphony-controls'), symphony, 'Symphony preview');

let lastTick = performance.now();
setInterval(() => {
  const now = performance.now();
  const playback = state.view === 'jukebox' ? player : symphony;
  if (playback.running) {
    playback.elapsed = Math.min(playback.duration, playback.elapsed + (now - lastTick) / 1000);
    if (playback.elapsed >= playback.duration) {
      playback.running = false;
      announce(state.view === 'jukebox' && state.mode === 'scan' ? 'Scan complete' : 'Preview complete');
    }
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
    return { ...config, ...fixtures[config.id] };
  }));
  symphony.duration = Math.max(...datasets.map(({ duration }) => duration));
  renderLibrary();
  renderShowcase();
  renderTiles();
  selectDataset(datasets[0]);
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
