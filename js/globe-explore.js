import { analyze, resetAnalyzer } from './analyzer.js';
import { formatTime } from './a11y.js';

const byId = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Latitude covered by the dataset's map rows, from its config (latMax at the top row, latMin at
 * the bottom). SST stops at about 79 degrees south; the others cover pole to pole.
 */
function latRange(data) {
  return [data.latMax ?? 90, data.latMin ?? -90];
}

/** Row centre to polar angle on the globe (0 = north pole). */
function rowTheta(data, y) {
  const [top, bottom] = latRange(data);
  const lat = top - ((y + 0.5) / data.grid.h) * (top - bottom);
  return ((90 - lat) / 180) * Math.PI;
}

/** Latitude (from a globe click) to a map row, or -1 outside the map area. */
export function latRow(data, lat) {
  const [top, bottom] = latRange(data);
  const row = Math.floor(((top - lat) / (top - bottom)) * data.grid.h);
  return row >= 0 && row < data.grid.h ? row : -1;
}

export function bindGlobeExplore({ video, select, hear, setFrameExplorer }) {
  const picker = byId('explore-dataset');
  const mount = byId('explore-globe');
  const status = byId('explore-map-status');
  const list = byId('explore-pins');
  const selection = byId('explore-selection');
  let data, globe, pending;
  let visible = false;
  let frameExplorer = false;
  let grid = [];
  let selectionRun = 0;

  function valueText(value) {
    return value == null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + (data.colorbar?.unit ?? '');
  }

  async function inspect(column, row) {
    const run = ++selectionRun;
    if (row < 0) {
      selection.textContent = 'Outside the map area of this visualization.';
      return;
    }
    const value = grid[row * data.grid.w + column];
    const label = 'Row ' + (row + 1) + ' · Column ' + (column + 1);
    selection.textContent = label + ' · ' + valueText(value);
    if (value == null) return;
    try {
      const note = await hear(data, value, column);
      if (note && run === selectionRun) selection.textContent += ' · ' + note;
    } catch {
      if (run === selectionRun) selection.textContent += ' · Audio unavailable';
    }
  }

  function refresh() {
    if (!visible || !data) return;
    const lightning = data.id === 'lightning';
    resetAnalyzer();
    const frame = video.readyState >= 2 && !video.error && !video.seeking ? analyze(video, data) : null;
    grid = frame?.grid ?? [];
    const points = grid.flatMap((value, index) => Number.isFinite(value) ? [{ value, index }] : []);
    points.sort((a, b) => b.value - a.value);
    const pins = [];
    for (const { value, index } of points) {
      if (lightning && value <= 0) break;
      const x = index % data.grid.w;
      const y = Math.floor(index / data.grid.w);
      if (pins.some((pin) => Math.hypot(pin.x - x, pin.y - y) < 3)) continue;
      pins.push({ x, y, value });
      if (pins.length === 8) break;
    }
    byId('explore-count').textContent = points.length;
    byId('explore-mean').textContent = valueText(frame?.mean);
    byId('explore-max').textContent = valueText(frame?.max);
    byId('explore-time').textContent = frame ? formatTime(video.currentTime) : '—';
    const useGlobe = Boolean(globe);
    status.textContent = !frame ? 'Waiting for a dataset frame'
      : !useGlobe ? 'Use the source frame while the 3D map loads.'
      : lightning ? 'Drag to rotate · Scroll to zoom · Pins represent camera-grid readings, without geographic coordinates.'
      : 'Drag to rotate · Scroll to zoom · Values follow the source frame grid';
    list.replaceChildren(...pins.map(({ x, y, value }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Row ' + (y + 1) + ' · Column ' + (x + 1) + ' · ' + valueText(value);
      button.addEventListener('click', () => inspect(x, y));
      return button;
    }));
    if (!pins.length) list.textContent = video.error ? 'Video unavailable.' : 'No marked values in this frame.';
    byId('jukebox').hidden = useGlobe;
    if (frameExplorer === useGlobe || useGlobe === false && video.dataset.exploreSource !== data.id) {
      frameExplorer = !useGlobe;
      video.dataset.exploreSource = data.id;
      setFrameExplorer(frameExplorer);
    }
    if (useGlobe) globe.render(data, pins, inspect);
    else mount.replaceChildren();
  }

  video.addEventListener('loadeddata', refresh);
  video.addEventListener('seeked', refresh);
  video.addEventListener('error', refresh);
  picker.addEventListener('change', () => select(picker.value));

  return {
    setDatasets(items) {
      picker.replaceChildren(...items.map((item) => new Option(item.title, item.id)));
    },
    update(next, active) {
      data = next;
      visible = active;
      frameExplorer = false;
      delete video.dataset.exploreSource;
      selectionRun++;
      if (!active || !data) return;
      picker.value = data.id;
      selection.textContent = 'Choose a point on the map or from the list.';
      pending ??= import('./vendor/three.module.js').then((THREE) => {
        globe = createGlobe(THREE, mount, status, () => { if (visible) setFrameExplorer(true); });
        refresh();
      }).catch(() => { if (visible) status.textContent = '3D unavailable. Use the source frame below.'; });
      refresh();
    },
  };
}

function createGlobe(THREE, mount, status, onFallback) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 30);
  const group = new THREE.Group();
  scene.add(group);
  const texture = new THREE.TextureLoader().load('media/earth.jpg', draw);
  texture.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({ map: texture }));
  group.add(earth);
  const markers = new THREE.Group();
  group.add(markers);
  const markerGeometry = new THREE.SphereGeometry(.027, 12, 8);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: '#ffca84' });
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = renderer.domElement;
  let distance = 3.7;
  let drag;
  let config;
  let inspect;

  function draw() {
    const { clientWidth: width, clientHeight: height } = mount;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = distance;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || !event.isPrimary) return;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4;
    if (!drag.moved) return;
    group.rotation.y += (event.clientX - drag.x) * .008;
    group.rotation.x = clamp(group.rotation.x + (event.clientY - drag.y) * .008, -1.45, 1.45);
    drag.x = event.clientX;
    drag.y = event.clientY;
    draw();
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerup', (event) => {
    if (!drag || !event.isPrimary) return;
    const moved = drag.moved;
    drag = null;
    if (moved || !config) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height);
    ray.setFromCamera(pointer, camera);
    const [hit] = ray.intersectObjects([earth, ...markers.children]);
    if (!hit) return;
    if (hit.object !== earth) {
      inspect(hit.object.userData.x, hit.object.userData.y);
      return;
    }
    // uv.y is 1 at the north pole and 0 at the south pole.
    inspect(clamp(Math.floor(hit.uv.x * config.grid.w), 0, config.grid.w - 1),
      latRow(config, hit.uv.y * 180 - 90));
  });

  function zoom(factor) {
    distance = clamp(distance * factor, 1.35, 7);
    draw();
  }
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom(Math.exp(clamp(event.deltaY, -100, 100) * .004));
  }, { passive: false });
  document.querySelectorAll('[data-globe-zoom]').forEach((button) => button.addEventListener('click', () => {
    if (!canvas.isConnected) return;
    const action = button.dataset.globeZoom;
    if (action === 'reset') { distance = 3.7; group.rotation.set(0, 0, 0); draw(); }
    else zoom(action === 'in' ? .8 : 1.25);
  }));
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    byId('jukebox').hidden = false;
    onFallback();
    status.textContent = '3D unavailable. Use the source frame below.';
  });
  new ResizeObserver(draw).observe(mount);

  return {
    render(data, pins, onInspect) {
      config = data;
      inspect = onInspect;
      if (!canvas.isConnected) mount.append(canvas);
      markers.clear();
      for (const pin of pins) {
        const phi = 2 * Math.PI * (pin.x + .5) / data.grid.w;
        const theta = rowTheta(data, pin.y);
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).multiplyScalar(1.015);
        marker.userData = pin;
        markers.add(marker);
      }
      draw();
    },
  };
}
