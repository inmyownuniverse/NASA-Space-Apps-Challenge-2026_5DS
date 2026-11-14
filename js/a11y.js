// Owner: Hazel · Support: Celene
// Accessible output: screen-reader announcements, speech, vibration, frame descriptions.

const DATA_THROTTLE_MS = 5000; // at most one data line per 5 s so screen readers aren't flooded
let lastDataAnnounce = 0;

/**
 * Write text into the aria-live="polite" region (#live).
 * @param {string} text
 * @param {{ data?: boolean }} [opts] data: true → throttled to one line per 5 s
 */
export function announce(text, { data = false } = {}) {
  const live = document.getElementById('live');
  if (!live || !text) return;

  if (data) {
    const now = performance.now();
    if (now - lastDataAnnounce < DATA_THROTTLE_MS) return;
    lastDataAnnounce = now;
  }

  // Clear first so repeating the same text is still announced.
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 50);
}

/** Speak text aloud with the Web Speech API (works without a screen reader). */
export function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

/**
 * Speak text and wait until it has been said (or maxMs passed, or speech isn't available).
 * @returns {Promise<void>}
 */
export function speakAndWait(text, maxMs = 6000) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 'speechSynthesis' in window ? maxMs : 1200);
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}

/** Short vibration on phones that support it (no-op elsewhere). */
export function buzz(ms) {
  navigator.vibrate?.(ms);
}

/** "1:05" from seconds. */
export function formatTime(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Describe a frame in words, update the visible readout, and announce it (throttled).
 * @returns {string} the description
 */
export function describe(features, cfg, t) {
  const unit = cfg.colorbar.unit ?? '';
  const fmt = (v) => (v === null || v === undefined ? 'no data' : `${v.toFixed(1)} ${unit}`.trim());
  let text = `${formatTime(t)}: average ${fmt(features.mean)}, highest ${fmt(features.max)}.`;
  if (features.flashes?.length) text += ` ${features.flashes.length} flashes.`;
  if (features.fake) text += ' (sample data)';
  // TODO(Celene): friendlier, dataset-specific wording (e.g. "the Gulf Stream is warming").

  const readout = document.getElementById('readout');
  if (readout) readout.textContent = text;
  announce(text, { data: true });
  return text;
}
