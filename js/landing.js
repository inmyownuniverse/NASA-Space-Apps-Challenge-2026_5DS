import { bindNavigation } from './navigation.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => value * value * (3 - 2 * value);

const features = [
  ['Listen to the planet', 'Open Jukebox', 'play', '#b9e0dc'],
  ['Follow a west-to-east sweep', 'Open Scan', 'scan', '#eac396'],
  ['Find the sound of a location', 'Open Explore', 'explore', '#97d5ff'],
  ['Four views of one planet', 'Open Planet Symphony', 'symphony', '#d8b5ee'],
];

export function initLanding() {
  const home = document.getElementById('home');
  const landing = home.querySelector('.landing');
  document.querySelectorAll('.sound-track').forEach((track) => {
    track.append(track.firstElementChild.cloneNode(true));
  });
  const showcase = document.getElementById('dataset-showcase');
  const cue = home.querySelector('.flight-cue');
  cue.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showcase.querySelector('h2').focus({ preventScroll: true });
    showcase.scrollIntoView({ behavior: preferences.matches ? 'instant' : 'smooth' });
  });
  const mount = document.getElementById('orbit-scene');
  const preferences = matchMedia('(prefers-reduced-motion: reduce)');
  let progress = 0;
  let visible = false;
  let started = false;
  let scene;
  let selected = 0;

  let scrollFrame = 0;
  function updateScroll() {
    scrollFrame = 0;
    if (!visible) return;
    const { top, height } = home.getBoundingClientRect();
    const travel = height - landing.offsetHeight;
    progress = preferences.matches || travel <= 0 ? 0 : clamp(-top / travel);
    const exit = smooth(clamp((progress - 0.68) / 0.32));
    const showcaseBounds = showcase.getBoundingClientRect();
    home.style.setProperty('--flight-exit', exit);
    home.style.setProperty('--flight-copy', smooth(clamp(progress / 0.42)));
    home.style.setProperty('--flight-sides', smooth(clamp(progress / 0.32)));
    const reveal = clamp((innerHeight - showcaseBounds.top) / (innerHeight * 0.48));
    showcase.style.setProperty('--arrival', preferences.matches ? 1 : reveal);
    home.style.setProperty('--surface-progress', progress);
    scene?.update();
  }

  function queueScroll() {
    if (visible && !scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueScroll);
  preferences.addEventListener('change', queueScroll);
  document.addEventListener('visibilitychange', queueScroll);

  function changeFeature(step) {
    selected = (selected + step + features.length) % features.length;
    const [subtitle, action, route, accent] = features[selected];
    document.getElementById('hero-subtitle').textContent = subtitle;
    const link = document.getElementById('hero-action');
    link.firstChild.textContent = action + ' ';
    link.hash = route;
    home.style.setProperty('--orbit-accent', accent);
    scene?.update();
    if (!preferences.matches) {
      document.querySelector('#hero-subtitle').animate(
        [{ opacity: 0.25, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 360, easing: 'ease-out' },
      );
    }
  }

  document.getElementById('previous-feature').addEventListener('click', () => changeFeature(-1));
  document.getElementById('next-feature').addEventListener('click', () => changeFeature(1));
  const closeMenu = bindNavigation();

  return {
    setVisible(value) {
      visible = value;
      closeMenu();
      if (visible && !started) {
        started = true;
        import('./vendor/three.module.js').then(async (three) => {
          scene = await createOrbit(three, mount, () => ({ visible, progress, selected, idle: !preferences.matches && scrollY <= 1 }));
          scene.update();
        }).catch(() => { mount.remove(); });
      }
      if (visible) queueScroll();
      else scene?.update();
    },
  };
}

async function createOrbit(THREE, mount, getState) {
  const texture = await new THREE.TextureLoader().loadAsync('media/earth.jpg');
  texture.colorSpace = THREE.SRGBColorSpace;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  mount.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    mount.classList.remove('rendering');
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  camera.position.z = 10000;
  camera.near = 1;
  camera.far = 20000;
  scene.add(new THREE.AmbientLight(0xa8caff, 0.55));
  const sun = new THREE.DirectionalLight(0xffe2be, 2.45);
  sun.position.set(-0.55, 1, 1.25);
  scene.add(sun);

  const geometry = new THREE.SphereGeometry(1, 64, 48);
  const planets = [0xc7e0d8, 0xf7cc9f, 0x73cbf6].map((color, index) => {
    const material = new THREE.MeshStandardMaterial({ map: texture, color, roughness: 1 });
    const planet = new THREE.Mesh(geometry, material);
    planet.rotation.set(0.16, index * 2 + 1.7, -0.22);
    scene.add(planet);
    return planet;
  });
  const tint = new THREE.Color();
  function resize() {
    const { clientWidth: width, clientHeight: height } = mount;
    if (!width || !height) return false;
    if (camera.right !== width / 2 || camera.top !== height / 2) {
      renderer.setSize(width, height, false);
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
      const side = Math.min(width * 0.16, 234);
      for (const [index, sign] of [[1, -1], [2, 1]]) {
        planets[index].scale.setScalar(side);
        planets[index].position.set(sign * width * 0.515, height * 0.13, -30);
      }
    }
    return true;
  }

  let frame = 0;
  let lastTime = 0;
  let spin = 0;

  function draw(time) {
    frame = 0;
    const { visible, progress, selected, idle } = getState();
    if (!visible || document.hidden || !resize() || renderer.getContext().isContextLost()) return;
    if (idle && lastTime) spin += Math.min(time - lastTime, 50) * 0.00019;
    lastTime = idle ? time : 0;
    planets.slice(1).forEach((planet, index) => {
      planet.rotation.y = 3.7 + index * 2 + spin * (index ? -1.25 : 0.8);
    });
    const { right, top } = camera;
    const approach = smooth(clamp(progress / 0.83));
    const radius = Math.min(right * 0.74 + 28, 620) + approach * Math.max(right * 1.45, top * 2.15);
    const earth = planets[0];
    earth.scale.setScalar(radius);
    earth.position.set(right * Math.sin(progress * Math.PI) * -0.32, top * (0.16 + approach * 2.05) - radius, 0);
    earth.rotation.set(0.16 + approach * 0.52, 1.7 + spin - progress * 2.15, -0.22 + approach * 0.48);
    earth.material.color.copy(tint.set(features[selected][3]));
    planets[1].position.x = -right * (1.03 + approach * 0.9);
    planets[2].position.x = right * (1.03 + approach * 0.9);
    sun.intensity = 2.45 + Math.sin(approach * Math.PI) * 1.15;
    renderer.render(scene, camera);
    mount.classList.add('rendering');
    if (idle) frame = requestAnimationFrame(draw);
  }

  function update() {
    cancelAnimationFrame(frame);
    draw(performance.now());
  }

  new ResizeObserver(update).observe(mount);
  renderer.domElement.addEventListener('webglcontextrestored', update);
  return { update };
}
