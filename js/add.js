// Owner: Freia · Support: Aahana, Hazel
// "Add a visualization": load any video or image, mark the map box and the colour bar,
// hear it straight away with the same engine, and download the dataset config.

import { analyze, resetAnalyzer } from './analyzer.js';
import { initAudio, loadDataset, playFrame, releaseAll } from './sound/engine.js';
import { announce } from './a11y.js';

const $ = (id) => document.getElementById(id);
const STEP_MS = 250;   // analyse 4 frames per second, like the player
const STOPS = 16;      // colour bar samples

let source = null;     // <video>, or a canvas holding the image (with video-like fields)
let fileName = 'my-visualization.mp4';
let stops = [];
let timer = null;
let picking = null;    // 'box' | 'bar1' | 'bar2' | null
let drag = null;

const canvas = $('overlay');
const ctx = canvas.getContext('2d');
const num = (id) => Number($(id).value);

/** Show a short message under step n (0 = top of the page) and read it out to screen readers. */
function say(n, text, isError = false) {
  const el = $('status-' + n);
  if (el) {
    el.textContent = text;
    el.classList.toggle('step-error', isError);
  }
  announce(text);
}

const fail = (n, text) => say(n, text, true);

// ---------- loading ----------

$('file').addEventListener('change', () => {
  const file = $('file').files[0];
  if (!file) return;
  stop();
  fileName = file.name;
  const url = URL.createObjectURL(file);
  const broken = () => fail(1, `Could not open "${file.name}". Try an MP4 or WebM video, or a PNG or JPG image.`);
  if (file.type.startsWith('image/')) {
    const img = new Image();
    img.onerror = broken;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      // The analyser expects a video; give the still image the same fields.
      Object.assign(c, { readyState: 4, videoWidth: c.width, videoHeight: c.height, currentTime: 0 });
      ready(c, img);
    };
    img.src = url;
  } else {
    const v = $('video');
    v.onerror = broken;
    v.src = url;
    v.addEventListener('loadeddata', () => ready(v, null), { once: true });
  }
});

const steps = [...document.querySelectorAll('#steps fieldset')];
const progress = [...document.querySelectorAll('.add-progress li')];
const stepTitles = ['Load an image or video', 'Select the map area', 'Set the colour bar', 'Choose a sound', 'Review and save'];
let activeStep = 0;

function showStep(index, focus = false) {
  activeStep = index;
  steps.forEach((step, i) => { step.hidden = i !== index; });
  progress.forEach((item, i) => {
    item.classList.toggle('complete', i < index);
    if (i === index) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
    item.firstElementChild.textContent = i < index ? '✓' : String(i + 1).padStart(2, '0');
  });
  $('steps-heading').textContent = stepTitles[index];
  $('step-back').hidden = index === 0;
  $('step-next').hidden = index === steps.length - 1;
  if (focus) $('steps').focus();
}

$('step-back').addEventListener('click', () => showStep(activeStep - 1, true));
$('step-next').addEventListener('click', () => {
  if (!source) { fail(1, 'Choose an image or video, or try the example.'); return; }
  if (activeStep === 1 && [num('cx'), num('cy'), num('cw'), num('ch')].some((value, i) => !Number.isFinite(value) || value < (i < 2 ? 0 : 1))) {
    fail(2, 'Enter a valid map box.'); return;
  }
  if (activeStep === 2 && !stops.length) {
    sampleBar();
    if (!stops.length) return;
  }
  showStep(activeStep + 1, true);
});
showStep(0);

function ready(src, img) {
  source = src;
  $('preview-filename').textContent = fileName;
  $('preview-filename').hidden = false;
  $('video').hidden = Boolean(img);
  if (img) {
    // Show the still image behind the overlay.
    $('overlay').style.background = `center / 100% 100% no-repeat url("${img.src}")`;
  } else {
    $('overlay').style.background = '';
  }
  canvas.width = source.videoWidth;
  canvas.height = source.videoHeight;
  canvas.parentElement.style.aspectRatio = canvas.width + ' / ' + canvas.height;
  $('empty').hidden = true;
  $('cw').value = source.videoWidth;
  $('ch').value = source.videoHeight;
  $('cx').value = 0;
  $('cy').value = 0;
  draw();
  update();
  say(1, `Loaded ${fileName}, ${source.videoWidth} by ${source.videoHeight} pixels. Next: step 2, mark the map.`);
}

// ---------- marking the map box and the colour bar ----------

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return [
    Math.round(((e.clientX - r.left) / r.width) * canvas.width),
    Math.round(((e.clientY - r.top) / r.height) * canvas.height),
  ];
}

function setPicking(mode) {
  picking = mode;
  $('pick-box').setAttribute('aria-pressed', String(mode === 'box'));
  $('pick-bar').setAttribute('aria-pressed', String(mode === 'bar1' || mode === 'bar2'));
  canvas.classList.toggle('pick-on', Boolean(mode));
}

$('pick-box').addEventListener('click', () => {
  setPicking(picking === 'box' ? null : 'box');
  if (picking) announce('Drag a box over the map on the preview.');
});
$('pick-bar').addEventListener('click', () => {
  setPicking(picking ? null : 'bar1');
  if (picking) announce('Click the low end of the colour bar.');
});

canvas.addEventListener('pointerdown', (e) => {
  if (!source || !picking) return;
  const [x, y] = canvasPoint(e);
  if (picking === 'box') {
    drag = [x, y];
    canvas.setPointerCapture(e.pointerId);
  } else if (picking === 'bar1') {
    $('bx1').value = x; $('by1').value = y;
    setPicking('bar2');
    announce('Now click the high end of the colour bar.');
    draw();
  } else if (picking === 'bar2') {
    $('bx2').value = x; $('by2').value = y;
    setPicking(null);
    sampleBar();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const [x, y] = canvasPoint(e);
  $('cx').value = Math.min(x, drag[0]);
  $('cy').value = Math.min(y, drag[1]);
  $('cw').value = Math.max(1, Math.abs(x - drag[0]));
  $('ch').value = Math.max(1, Math.abs(y - drag[1]));
  draw();
});
canvas.addEventListener('pointerup', () => {
  if (!drag) return;
  drag = null;
  setPicking(null);
  update();
  say(2, `Map area set: left ${$('cx').value}, top ${$('cy').value}, ${$('cw').value} by ${$('ch').value} pixels.`);
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!source) return;
  ctx.lineWidth = Math.max(2, canvas.width / 400);
  ctx.strokeStyle = '#ffd23f';
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(num('cx'), num('cy'), num('cw'), num('ch'));
  ctx.setLineDash([]);
  const [x1, y1, x2, y2] = ['bx1', 'by1', 'bx2', 'by2'].map(num);
  if (x1 || y1 || x2 || y2) {
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(x, y, ctx.lineWidth * 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ---------- reading the colour bar (same idea as tools/sample_colorbar.py) ----------

function frameData() {
  const c = document.createElement('canvas');
  c.width = source.videoWidth;
  c.height = source.videoHeight;
  const cctx = c.getContext('2d', { willReadFrequently: true });
  cctx.drawImage(source, 0, 0);
  return cctx.getImageData(0, 0, c.width, c.height);
}

function sampleBar() {
  if (!source) { fail(3, 'Load an image or video in step 1 first.'); return; }
  const [x1, y1, x2, y2] = ['bx1', 'by1', 'bx2', 'by2'].map(num);
  const vmin = num('vmin'), vmax = num('vmax');
  const img = frameData();
  const at = (x, y) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = Math.min(img.width - 1, Math.max(0, x + dx));
        const py = Math.min(img.height - 1, Math.max(0, y + dy));
        const i = (py * img.width + px) * 4;
        r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
      }
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  };
  stops = [];
  for (let i = 0; i < STOPS; i++) {
    const t = i / (STOPS - 1);
    stops.push({
      rgb: at(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t)),
      value: Math.round((vmin + (vmax - vmin) * t) * 1000) / 1000,
    });
  }
  $('gradient').style.background = `linear-gradient(to right, ${stops.map((s) => `rgb(${s.rgb.join(',')})`).join(', ')})`;
  $('stops-text').textContent = `Read ${STOPS} colours from ${vmin} to ${vmax} ${$('unit').value}.`;
  draw();
  update();
  say(3, `Colour bar set: ${vmin} to ${vmax} ${$('unit').value} (${STOPS} colours read). ${matchText()} Next: step 4, press Play.`);
}
$('sample').addEventListener('click', sampleBar);

// ---------- the config ----------

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-visualization';
}

function buildCfg() {
  const id = slug($('title').value);
  const mapper = $('mapper').value;
  const vmin = num('vmin'), vmax = num('vmax');
  const unit = $('unit').value;
  const span = vmax - vmin;
  return {
    id,
    title: $('title').value,
    source: $('source').value,
    video: `media/${fileName}`,
    dates: '',
    description: `${$('title').value}, turned into sound from its colour bar (${vmin} to ${vmax} ${unit}).`,
    crop: { x: num('cx'), y: num('cy'), w: num('cw'), h: num('ch') },
    grid: { w: 32, h: 16 },
    colorbar: { unit, stops, maxDist: num('maxdist') },
    sound: {
      mapper,
      scale: $('scale').value,
      instrument: $('instrument').value,
      valueTo: mapper === 'density' ? 'note density' : 'pitch',
      changeTo: mapper === 'density' ? 'sparkle' : 'filter',
      legendExamples: [
        { values: [vmin + 0.8 * span, vmin + 0.9 * span, vmax] },
        { values: [vmin + 0.2 * span, vmin + 0.1 * span, vmin] },
      ],
    },
    legend: [
      { sound: 'high notes', means: `high ${unit}` },
      { sound: 'low notes', means: `low ${unit}` },
    ],
  };
}

let cfg = null;
/** "314 of 512 map cells match the colour bar, average 16.8 °C." for the current settings. */
function matchText() {
  if (!source || !stops.length) return '';
  const f = analyze(source, buildCfg());
  const hits = f.grid.filter((v) => v !== null).length;
  return `${hits} of ${f.grid.length} map cells match the colour bar` +
    (f.mean !== null ? `, average ${f.mean.toFixed(1)} ${$('unit').value}.` : '.') +
    (hits < 20 ? ' Very few match: check the map box, the colour bar ends, or raise the colour tolerance.' : '');
}

function update() {
  draw();
  cfg = buildCfg();
  $('json').value = JSON.stringify(cfg, null, 2);
  if (source && stops.length) {
    $('check').textContent = 'Check: ' + matchText();
  }
  if (timer) loadDataset(cfg);
}
for (const el of document.querySelectorAll('#steps input:not([type=file]), #steps select')) {
  el.addEventListener('change', update);
}

// ---------- play ----------

async function play() {
  if (!source) { fail(4, 'Load an image or video in step 1 first, or press "Try with an example".'); return; }
  if (!stops.length) { fail(4, 'Read the colour bar in step 3 first.'); return; }
  await initAudio();
  stop();
  cfg = buildCfg();
  loadDataset(cfg);
  resetAnalyzer();
  if (source instanceof HTMLVideoElement) source.play().catch(() => {});
  timer = setInterval(() => {
    const f = analyze(source, cfg);
    playFrame(f, cfg, source.currentTime ?? 0);
  }, STEP_MS);
  say(4, `Playing ${cfg.title}. Press Stop or Escape to stop.`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  if (source instanceof HTMLVideoElement) source.pause();
  releaseAll();
}

$('play').addEventListener('click', play);
$('stop').addEventListener('click', () => { stop(); say(4, 'Stopped.'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (timer) say(4, 'Stopped.'); stop(); setPicking(null); } });

$('download').addEventListener('click', () => {
  update();
  const blob = new Blob([JSON.stringify(cfg, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${cfg.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say(5, `Downloaded ${cfg.id}.json. Put it in datasets/ and add its name to datasets/index.json.`);
});

// ---------- one-click example: an SST frame with its colour bar ----------
// The bundled still combines the SST frame at 10 seconds and its calibrated colour bar.
const EXAMPLE = {
  image: 'media/sst-example.png',
  size: [1280, 760], crop: [0, 0, 1280, 600], ends: [501, 678, 774, 678],
  vmin: 0, vmax: 32, unit: '°C', tolerance: 75,
  title: 'Sea Surface Temperature (example)', source: 'https://svs.gsfc.nasa.gov/3912/',
};

async function loadExample() {
  stop();
  say(0, 'Loading the example…');
  try {
    const image = new Image();
    image.src = EXAMPLE.image;
    await image.decode();
    const c = document.createElement('canvas');
    [c.width, c.height] = EXAMPLE.size;
    c.getContext('2d').drawImage(image, 0, 0);
    // The analyser expects a video; give the still image the same fields.
    Object.assign(c, { readyState: 4, videoWidth: c.width, videoHeight: c.height, currentTime: 0 });
    fileName = 'sst-example.mp4';
    ready(c, image);
    const set = (id, val) => { $(id).value = val; };
    [['cx', 0], ['cy', 1], ['cw', 2], ['ch', 3]].forEach(([id, i]) => set(id, EXAMPLE.crop[i]));
    [['bx1', 0], ['by1', 1], ['bx2', 2], ['by2', 3]].forEach(([id, i]) => set(id, EXAMPLE.ends[i]));
    set('vmin', EXAMPLE.vmin); set('vmax', EXAMPLE.vmax); set('unit', EXAMPLE.unit);
    set('maxdist', EXAMPLE.tolerance); set('title', EXAMPLE.title); set('source', EXAMPLE.source);
    set('mapper', 'continuousField'); set('instrument', 'warmPad');
    say(1, 'Loaded an SST frame, with its colour bar added underneath.');
    say(2, 'Map area set: the map without the colour bar, 1280 by 600 pixels.');
    sampleBar();
    say(0, 'Example ready. Adjust the map area or continue.');
    showStep(1, true);
  } catch {
    fail(0, 'The bundled SST example image could not load. Refresh the page and try again.');
  }
}
$('example').addEventListener('click', loadExample);

update();
