const tourStops = [
  ['.library', 'Dataset library', (data) =>
    'Grace had a spaceship. You have four NASA datasets! You’re exploring ' + data.title + '. Pick another dataset here to hear a different part of Earth.'],
  ['#stage', 'Earth visualization', (data) =>
    data.description + ' This picture gives us clues to turn into sound. On Erid we use musical sounds to talk, so this feels like home.'],
  ['#player-controls', 'Playback controls', () =>
    'Press Play to hear the picture change over time, or drag the timeline to jump to a moment. Changing volume makes the sound louder or quieter. It can’t turn up the Sun, which would have saved Grace and me some work.'],
  ['.modes', 'Play and Scan', () =>
    'Play follows the video. Scan holds one frame still and reads across it from left to right. Imagine reading a page with your ears. Five hands help with pages, by the way.'],
  ['.sonic-legend', 'Sonic legend', (data) =>
    'This is your sound dictionary: ' + (data.legend[0] ? data.legend[0].sound + ' means ' + data.legend[0].means : 'each entry explains a sound') + '. Grace and I started with a dictionary too. Ours needed more humming.'],
  ['#readout', 'Live readout', () =>
    'Look here for readings as the video plays or the scan moves. The dots keep a short history so you can compare one reading with another. Even rock scientists take notes.'],
  ['.mapping-notes', 'How we mapped it', () =>
    'Here’s the recipe for turning the picture into music, plus a link to the original NASA visualization. That’s the end of our tour. Fist bump! I brought five options.'],
];

import { initAudio, playChirp } from './sound/engine.js';

// Live chat needs our local server (server.mjs). On a static site like GitHub Pages it isn't
// there: we find that out once and then stop asking, so the console isn't filled with errors.
let liveChat = null; // null = not tried yet, true = server answered, false = no server
const NO_SERVER = 'Rocky’s live chat works when you run the app locally with our server. The tour works everywhere.';

export function bindRocky() {
  const panel = document.getElementById('rocky');
  const answer = panel.querySelector('#rocky-answer');
  const form = panel.querySelector('form');
  const input = form.querySelector('input');
  const ask = form.querySelector('button');
  const mascot = panel.querySelector('.rocky-mascot');
  const chat = panel.querySelector('#rocky-chat-panel');
  const toggle = panel.querySelector('#rocky-chat');
  // Rocky's chord chirp is made with Tone.js (the .wav file is not in the repo).
  const chirp = {
    play: async () => { await initAudio(); playChirp(); },
    pause() {},
    currentTime: 0,
  };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const greeting = panel.querySelector('#rocky-greeting');
  let greeted = false;
  let greetingTimer;
  function hideGreeting() {
    clearTimeout(greetingTimer);
    greeting.hidden = true;
  }
  let movement;

  function move(frames, duration) {
    if (motion.matches) return;
    movement?.cancel();
    movement = mascot.animate(frames, { duration, easing: 'ease-out' });
  }

  function stopChirp() {
    chirp.pause();
    chirp.currentTime = 0;
  }
  let active;

  const startTour = panel.querySelector('#rocky-tour-start');
  const tour = panel.querySelector('#rocky-tour');
  const nextStop = panel.querySelector('#rocky-tour-next');
  const search = panel.querySelector('#rocky-search');
  const options = panel.querySelector('#rocky-search-options');
  const picker = panel.querySelector('#rocky-section-picker');
  const sectionList = panel.querySelector('#rocky-section-list');
  const details = [
    'The dataset changes the map, its units, and which sounds are used. Each row also shows the time period covered.',
    'The app samples small cells in the visualization. For ocean temperature it reads colors against a calibrated scale. Other datasets use clues like flashes or brightness.',
    'Use the timeline to revisit something you heard. Eyes Closed adds spoken summaries, and Copy link lets someone open the same dataset and moment.',
    'Scan reads columns in order, so a change in sound can help you notice where a pattern changes across the frame.',
    'Try the example sounds, then listen for the same clues during playback. The rules depend on which dataset you picked.',
    'In Play, the labels show video time. In Scan, they show the column that was just read. The units tell you what the numbers mean.',
    'The mapping explains which part of the sound represents the data. The NASA source lets you compare our interpretation with the original.',
  ];

  function setOptions(open) {
    options.hidden = !open;
    picker.hidden = true;
    stopPicking();
    search.setAttribute('aria-expanded', String(open));
  }

  let step = -1;
  let target;
  let travel;

  function endTour(restoreFocus = false) {
    step = -1;
    target?.classList.remove('rocky-tour-target');
    target = undefined;
    travel?.cancel();
    panel.style.removeProperty('--rocky-lift');
    panel.style.removeProperty('--rocky-side');
    tour.hidden = true;
    setOptions(false);
    form.hidden = false;
    answer.hidden = false;
    if (restoreFocus) search.focus({ preventScroll: true });
  }

  function placeRocky() {
    if (step < 0 || !target) return;
    const rect = target.getBoundingClientRect();
    const lift = Math.max(16, Math.min(innerHeight - 300, innerHeight - rect.bottom + 8));
    panel.style.setProperty('--rocky-lift', lift + 'px');
    const side = Math.max(16, Math.min(innerWidth - 110, innerWidth - rect.right));
    panel.style.setProperty('--rocky-side', side + 'px');
    chat.style.setProperty('--rocky-card-nudge', Math.max(0, Math.min(310, innerWidth - 32) - (innerWidth - side)) + 'px');
  }

  function showStop() {
    const [selector, title, explain] = tourStops[step];
    target?.classList.remove('rocky-tour-target');
    target = document.querySelector('#jukebox ' + selector);
    const before = panel.getBoundingClientRect();
    travel?.cancel();
    target.classList.add('rocky-tour-target');
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    placeRocky();
    const after = panel.getBoundingClientRect();
    if (!motion.matches) {
      travel = panel.animate([
        { transform: 'translate(' + (before.left - after.left) + 'px,' + (before.top - after.top) + 'px)' },
        { transform: 'translateY(-12px)', offset: .78 },
        { transform: 'none' },
      ], { duration: 560, easing: 'ease-out' });
      move([{ transform: 'rotate(-25deg)' }, { transform: 'rotate(12deg)' }, { transform: 'none' }], 560);
    }
    panel.querySelector('#rocky-tour-step').textContent = (step + 1) + ' / ' + tourStops.length + ' · ' + title;
    panel.querySelector('#rocky-tour-copy').textContent = explain(active);
    nextStop.textContent = step === tourStops.length - 1 ? 'Finish tour' : 'Next stop';
  }

  function explainSection(index) {
    endTour();
    request?.abort();
    request = undefined;
    ask.disabled = false;
    mascot.classList.remove('thinking');
    const [selector, title, explain] = tourStops[index];
    target = document.querySelector('#jukebox ' + selector);
    target?.classList.add('rocky-tour-target');
    answer.textContent = title + ' · ' + explain(active) + ' ' + details[index];
    setChat(true);
    answer.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    input.focus({ preventScroll: true });
  }

  function beginTour(index) {
    step = index;
    setOptions(false);
    form.hidden = true;
    answer.hidden = true;
    tour.hidden = false;
    showStop();
    nextStop.focus({ preventScroll: true });
  }

  const selectionBox = document.createElement('div');
  selectionBox.className = 'rocky-selection-box';
  selectionBox.hidden = true;
  selectionBox.setAttribute('aria-hidden', 'true');
  document.body.append(selectionBox);
  let dragStart;
  let selectedContent;

  function stopPicking() {
    document.body.classList.remove('rocky-picking');
    selectionBox.hidden = true;
    dragStart = undefined;
    selectedContent = undefined;
  }

  function selectArea(event) {
    if (!dragStart) return;
    const left = Math.min(dragStart.x, event.clientX);
    const top = Math.min(dragStart.y, event.clientY);
    const width = Math.abs(event.clientX - dragStart.x);
    const height = Math.abs(event.clientY - dragStart.y);
    Object.assign(selectionBox.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
    selectionBox.hidden = false;
    selectedContent = { left, top, width, height };
  }

  document.addEventListener('pointerdown', (event) => {
    if (!document.body.classList.contains('rocky-picking') || event.target.closest('#rocky') || event.button !== 0) return;
    event.preventDefault();
    dragStart = { x: event.clientX, y: event.clientY };
    selectArea(event);
  }, true);
  document.addEventListener('pointermove', selectArea);
  document.addEventListener('pointerup', (event) => {
    if (!dragStart) return;
    selectArea(event);
    dragStart = undefined;
  });
  document.addEventListener('pointercancel', () => { dragStart = undefined; });
  document.addEventListener('click', (event) => {
    if (document.body.classList.contains('rocky-picking') && !event.target.closest('#rocky')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!document.body.classList.contains('rocky-picking')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOptions(false);
      search.focus();
    }
    if (event.key !== 'Enter' || !selectedContent || event.target.closest('#rocky button')) return;
    event.preventDefault();
    event.stopPropagation();
    const { left, top, width, height } = selectedContent;
    const main = document.querySelector('#jukebox');
    const hit = document.elementsFromPoint(left + width / 2, top + height / 2)
      .find(element => main.contains(element) && !element.closest('#rocky'));
    const section = tourStops.findIndex(([selector]) => hit?.closest(selector));
    const overlap = tourStops.map(([selector], index) => {
      const rect = main.querySelector(selector).getBoundingClientRect();
      const area = Math.max(0, Math.min(rect.right, left + width) - Math.max(rect.left, left))
        * Math.max(0, Math.min(rect.bottom, top + height) - Math.max(rect.top, top));
      return { index, area };
    }).sort((a, b) => b.area - a.area)[0];
    if (section >= 0 || (!hit && overlap.area > 0)) {
      explainSection(section >= 0 ? section : overlap.index);
      return;
    }
    if (!hit) {
      setOptions(false);
      answer.textContent = 'I couldn’t find content in that area. Try selecting again.';
      input.focus({ preventScroll: true });
      return;
    }
    const text = (hit.closest('section, nav, p, button, a') ?? hit).textContent.trim().replace(/\s+/g, ' ').slice(0, 205);
    setOptions(false);
    if (!text) {
      answer.textContent = 'That area has no text I can read. Try selecting a label or a section.';
      input.focus({ preventScroll: true });
      return;
    }
    teach('Explain this part of Earth Jukebox to a student: ' + text);
    input.focus({ preventScroll: true });
  }, true);

  search.addEventListener('click', () => setOptions(options.hidden));
  startTour.addEventListener('click', () => beginTour(0));
  panel.querySelector('#rocky-section-start').addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    if (!picker.hidden) {
      document.body.classList.add('rocky-picking');
      picker.querySelector('p').focus({ preventScroll: true });
    } else stopPicking();
  });
  tourStops.forEach(([, title], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = title;
    button.addEventListener('click', () => explainSection(index));
    sectionList.append(button);
  });
  nextStop.addEventListener('click', () => {
    if (++step >= tourStops.length) endTour(true);
    else showStop();
  });
  panel.querySelector('#rocky-tour-end').addEventListener('click', () => endTour(true));
  window.addEventListener('scroll', placeRocky, { passive: true });
  window.addEventListener('resize', placeRocky);

  function setChat(open) {
    chat.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide Rocky chat' : 'Open Rocky chat');
  }

  toggle.addEventListener('click', () => {
    if (!chat.hidden) { closeChat(); return; }
    greeted = true;
    hideGreeting();
    setChat(true);
    move([{ transform: 'none' }, { transform: 'translateY(-19px) rotate(-10deg)' }, { transform: 'none' }], 430);
    input.focus();
  });
  function closeChat() {
    endTour();
    setChat(false);
    stopChirp();
    toggle.focus();
  }
  panel.querySelector('#rocky-close').addEventListener('click', closeChat);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !chat.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeChat();
    }
  });
  let request;

  async function teach(question) {
    if (!active) return;
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const dataset = active;
    ask.disabled = true;
    mascot.classList.add('thinking');
    if (liveChat === false) {
      answer.textContent = NO_SERVER;
      ask.disabled = false;
      mascot.classList.remove('thinking');
      return;
    }
    answer.textContent = 'Rocky is thinking…';
    try {
      const response = await fetch('api/rocky', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: dataset.id, question }),
      });
      if (request !== controller) return;
      if (!response.headers.get('content-type')?.includes('application/json')) {
        liveChat = false;
        answer.textContent = NO_SERVER;
        if (['localhost', '127.0.0.1'].includes(location.hostname)) {
          const link = document.createElement('a');
          link.href = 'http://127.0.0.1:8000/#play';
          link.textContent = 'Open Play on the Rocky server';
          answer.append(' ', link);
        }
        return;
      }
      liveChat = true;
      const result = await response.json();
      if (request !== controller) return;
      if (!response.ok || !result.answer) {
        answer.textContent = result.error ?? 'Rocky couldn’t answer. Try again shortly.';
        return;
      }
      answer.textContent = result.answer;
      mascot.classList.remove('thinking');
      if (!chat.hidden && tour.hidden) {
        move([
          { transform: 'none' },
          { transform: 'translate(-8px, -14px) rotate(-22deg)' },
          { transform: 'translate(8px, -4px) rotate(20deg)' },
          { transform: 'translate(3px, -13px) rotate(-12deg)' },
          { transform: 'none' },
        ], 710);
        stopChirp();
        chirp.play().catch(() => {});
      }
    } catch {
      if (!controller.signal.aborted) {
        liveChat = false; // no server reachable: say so once and stop retrying
        answer.textContent = NO_SERVER;
      }
    } finally {
      if (request === controller) {
        ask.disabled = false;
        mascot.classList.remove('thinking');
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (question) teach(question);
  });

  return (dataset, visible) => {
    const next = visible ? dataset : undefined;
    panel.hidden = !next;
    if (active === next) return;
    active = next;
    hideGreeting();
    request?.abort();
    stopChirp();
    endTour();
    setChat(false);
    answer.textContent = '';
    ask.disabled = false;
    mascot.classList.remove('thinking');
    if (!active) return;
    input.value = '';
    move([
      { transform: 'translateX(-75px) rotate(-220deg)', opacity: 0 },
      { transform: 'translateX(0) rotate(12deg)', opacity: 1, offset: .78 },
      { transform: 'none' },
    ], 680);
    if (!greeted) {
      greetingTimer = setTimeout(() => {
        greeted = true;
        greeting.hidden = false;
        greetingTimer = setTimeout(hideGreeting, 9500);
      }, motion.matches ? 0 : 690);
    }
  };
}
