// Owner: Freia · Support: Jaden
// Mapping rules: turn features into notes. One mapper per kind of visualization.
// Every mapper has the same signature: (features, cfg, inst, time)
//   features — from analyzer.analyze (see js/analyzer.js)
//   cfg      — dataset config; the mapper is chosen by cfg.sound.mapper
//   inst     — the voice bundle built by engine.js:
//              { inst, layers: { name: instrument }, layerGains: { name: Tone.Volume },
//                filter: Tone.Filter, panner: Tone.Panner, state: {} }
//   time     — audio-context time to schedule notes at
//
// Rules shared by every dataset:
//   - all notes snap to the dataset's scale (cfg.sound.scale, default C major pentatonic)
//   - at most cfg.sound.maxVoices notes at once (hard cap 8)
//   - values smoothed over cfg.sound.smoothFrames frames (running average)
//   - stereo pan follows longitude (column): −1 west … +1 east
//   - extreme values (above cfg.sound.tensionAbove) add a voice one semitone up
//
// Optional cfg.sound settings: filter [minHz, maxHz], litAbove (night-light threshold).

import { valueToMidi, midiToNote, valueRange, norm, scaleNotes } from './scales.js';

const VOICE_CAP = 8;
const MIN_CHANGE_GAP = 0.5;    // s between pad chord changes, so notes don't flicker
const DENSITY_GAP = 0.5;       // s between night-light sparkle bursts
const RESTRIKE_GAP = 1.2;      // s between strikes of percussive layers (sulfate bells)
const LAYER_SILENT_DB = -60;   // layer volume when an aerosol type is absent
const LAYER_PLACEHOLDER = 0.3; // layer strength used until the analyzer reports real layers

// ---------- helpers ----------

/** Sorted (ascending) non-null numbers. */
function validValues(values) {
  if (!values) return [];
  const out = [];
  for (const v of values) if (v !== null && v !== undefined && !Number.isNaN(v)) out.push(v);
  return out.sort((a, b) => a - b);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.round(p * (sorted.length - 1))];
}

function mean(values) {
  const v = validValues(values);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Running average over the last n frames, kept in state[key]. */
function smooth(state, key, value, n) {
  if (value === null || value === undefined || Number.isNaN(value)) return state[key + 'Avg'] ?? null;
  const buf = (state[key] ??= []);
  buf.push(value);
  while (buf.length > Math.max(1, n)) buf.shift();
  const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
  state[key + 'Avg'] = avg;
  return avg;
}

function soundOpts(cfg) {
  const s = cfg.sound;
  const [lo, hi] = s.octaves ?? [3, 5];
  return {
    lo, hi,
    scale: s.scale ?? 'C major pentatonic',
    maxVoices: Math.min(VOICE_CAP, s.maxVoices ?? 6),
    smoothFrames: s.smoothFrames ?? 3,
  };
}

/** Column → stereo pan, −1 (west) … +1 (east). */
function colToPan(col, gw) {
  return gw > 1 ? Math.max(-1, Math.min(1, -1 + (2 * col) / (gw - 1))) : 0;
}

/** features.change (0..1) → filter cutoff, exponential between cfg.sound.filter [min, max]. */
function changeToCutoff(change, cfg) {
  const [fMin, fMax] = cfg.sound.filter ?? [500, 5000];
  const c = Math.min(1, Math.max(0, (change ?? 0) * 4)); // typical change is small; scale it up
  return fMin * Math.pow(fMax / fMin, c);
}

function applyChange(features, cfg, voice) {
  if (cfg.sound.changeTo === 'filter' && voice.filter) {
    voice.filter.frequency.rampTo(changeToCutoff(features.change, cfg), 0.3);
  }
}

/**
 * Hold a set of notes on a sustaining instrument: release notes that left the set,
 * attack notes that joined it. notes = Map(midi → velocity).
 */
function holdNotes(inst, state, notes, time) {
  const held = (state.held ??= new Map());
  for (const midi of held.keys()) {
    if (!notes.has(midi)) {
      inst.triggerRelease(midiToNote(midi), time);
      held.delete(midi);
    }
  }
  for (const [midi, vel] of notes) {
    if (!held.has(midi)) {
      inst.triggerAttack(midiToNote(midi), time, vel);
      held.set(midi, vel);
    }
  }
}

// ---------- mappers ----------

/**
 * Continuous field (sea surface temperature): a held pad chord.
 *  - root note from the smoothed mean value (warm → high, cold → low)
 *  - extra voices from the coldest, warmest and middle parts of the grid
 *  - features.change → filter sweep (faster-moving currents = brighter tone)
 *  - max above tensionAbove → a quiet voice one semitone above the root
 * Notes are held and only change when the chord changes (at most every 0.5 s).
 */
export function continuousField(features, cfg, inst, time) {
  const voice = inst;
  const s = cfg.sound;
  const st = voice.state;
  const [min, max] = valueRange(cfg);
  const { lo, hi, scale, maxVoices, smoothFrames } = soundOpts(cfg);

  applyChange(features, cfg, voice);

  const avg = smooth(st, 'mean', features.mean, smoothFrames);
  if (avg === null) return;
  if (st.lastChange !== undefined && time - st.lastChange < MIN_CHANGE_GAP) return;

  // Skip tension on sample data: its max is a fixed placeholder, not a measurement.
  const tense = !features.fake && s.tensionAbove !== undefined &&
    features.max !== null && features.max !== undefined && features.max > s.tensionAbove;
  const budget = tense ? maxVoices - 1 : maxVoices;

  const root = valueToMidi(avg, min, max, lo, hi, scale);
  const notes = new Map([[root, 0.35]]);
  const vals = validValues(features.grid);
  for (const p of [0.1, 0.9, 0.5, 0.25, 0.75, 0.0, 1.0]) {
    if (notes.size >= budget || !vals.length) break;
    const midi = valueToMidi(percentile(vals, p), min, max, lo, hi, scale);
    if (!notes.has(midi)) notes.set(midi, 0.2);
  }
  if (tense) notes.set(root + 1, 0.12);

  const key = [...notes.keys()].sort((a, b) => a - b).join(',');
  if (key === st.lastKey) return;
  holdNotes(voice.inst, st, notes, time);
  st.lastKey = key;
  st.lastChange = time;
}

/**
 * Discrete events (lightning): one drum hit per new flash.
 *  - features.flashes = [{ x, y, value }] with x, y in grid cells (y = 0 is the north edge)
 *  - pan by column (west = left, east = right), pitch by row (north = higher)
 *  - velocity by flash brightness; at most maxVoices hits per frame, brightest first
 */
export function events(features, cfg, inst, time) {
  const voice = inst;
  const flashes = features.flashes ?? [];
  if (!flashes.length) return;

  const st = voice.state;
  const gw = cfg.grid?.w ?? 32;
  const gh = cfg.grid?.h ?? 16;
  const [min, max] = valueRange(cfg);
  const { lo, hi, scale, maxVoices } = soundOpts(cfg);

  const hits = [...flashes].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, maxVoices);
  // Monophonic drum: every hit must start strictly after the previous one.
  let t = Math.max(time, (st.lastHit ?? 0) + 0.03);
  for (const f of hits) {
    voice.panner?.pan.setValueAtTime(colToPan(f.x, gw), t);
    const midi = valueToMidi(gh - 1 - f.y, 0, gh - 1, lo, hi, scale);
    const vel = 0.3 + 0.7 * norm(f.value ?? max, min, max);
    voice.inst.triggerAttackRelease(midiToNote(midi), '16n', t, vel);
    st.lastHit = t;
    t += 0.06;
  }
}

/**
 * Density (night lights): sparkling glass notes.
 *  - share of lit cells (value > litAbove) → how many notes per burst (up to maxVoices)
 *  - brightness of the chosen cells → pitch and velocity
 *  - lit share growing since the last burst (new light) → one extra high sparkle note
 * Without per-cell data (sample data) it plays one note from the mean.
 */
export function density(features, cfg, inst, time) {
  const voice = inst;
  const s = cfg.sound;
  const st = voice.state;
  if (st.lastBurst !== undefined && time - st.lastBurst < DENSITY_GAP) return;

  const [min, max] = valueRange(cfg);
  const { lo, hi, scale, maxVoices } = soundOpts(cfg);
  const play = (value, t, vel) => {
    const midi = valueToMidi(value, min, max, lo, hi, scale);
    if (midi !== null) voice.inst.triggerAttackRelease(midiToNote(midi), '8n', t, vel);
  };

  const vals = validValues(features.grid);
  if (!vals.length) {
    if (features.mean === null || features.mean === undefined) return;
    play(features.mean, time, 0.3);
    st.lastBurst = time;
    return;
  }

  const litAbove = s.litAbove ?? min + 0.05 * (max - min);
  const lit = vals.filter((v) => v > litAbove);
  const frac = lit.length / vals.length;
  const growth = frac - (st.prevFrac ?? frac);
  st.prevFrac = frac;
  st.lastBurst = time;
  if (!lit.length) return;

  const n = Math.max(1, Math.min(maxVoices, Math.round(frac * maxVoices * 2)));
  const spacing = (DENSITY_GAP * 0.9) / n;
  for (let i = 0; i < n; i++) {
    const v = lit[Math.round((n === 1 ? 1 : i / (n - 1)) * (lit.length - 1))];
    play(v, time + i * spacing, 0.15 + 0.45 * norm(v, min, max));
  }
  if (growth > 0.01) play(max, time + DENSITY_GAP * 0.5, 0.25);
}

/**
 * Layers (aerosols): one instrument per aerosol type on a shared chord.
 *  - layer i plays chord tone i (dust lowest … sulfate highest), so the layers blend
 *  - the whole chord shifts up slightly with the overall mean value
 *  - features.layers[name] (0..1) → that layer's volume (absent → silent)
 *  - sustaining layers hold their note; percussive layers (bells) are re-struck every 1.2 s
 *  - the densest layer above tensionAbove adds a semitone-up voice on that layer
 */
export function layers(features, cfg, inst, time) {
  const voice = inst;
  const s = cfg.sound;
  const st = voice.state;
  const names = s.instruments ?? Object.keys(voice.layers);
  const [min, max] = valueRange(cfg);
  const { lo, hi, scale, smoothFrames } = soundOpts(cfg);
  const notes = scaleNotes(lo, hi, scale);
  const hasLayers = features.layers && Object.keys(features.layers).length > 0;

  applyChange(features, cfg, voice);

  const avg = smooth(st, 'mean', features.mean, smoothFrames);
  const shift = avg === null ? 0 : Math.round(norm(avg, min, max) * 2); // 0–2 scale steps
  st.loudestStrength = -1;

  names.forEach((name, i) => {
    const layerInst = voice.layers[name];
    const gain = voice.layerGains[name];
    if (!layerInst || !gain) return;

    // TODO(Aahana): features.layers[name] is a placeholder until the analyzer measures layers.
    const strength = Math.min(1, hasLayers ? (features.layers[name] ?? 0) : LAYER_PLACEHOLDER);
    const db = strength <= 0.02 ? LAYER_SILENT_DB : -30 + 30 * strength;
    gain.volume.rampTo(db, 0.5);
    if (strength > st.loudestStrength) { st.loudest = name; st.loudestStrength = strength; }

    const idx = Math.min(notes.length - 1, Math.round(((i + 0.5) / names.length) * (notes.length - 3)) + shift);
    const midi = notes[idx] + (layerInst.octaveUp ? 12 : 0);
    const ls = (st[name] ??= {});
    const tense = hasLayers && s.tensionAbove !== undefined && strength > s.tensionAbove;

    if (layerInst.percussive) {
      if (strength <= 0.02) return;
      if (ls.lastStrike !== undefined && time - ls.lastStrike < RESTRIKE_GAP) return;
      layerInst.triggerAttackRelease(midiToNote(midi + (tense ? 1 : 0)), 1, time, 0.3 + 0.5 * strength);
      ls.lastStrike = time;
      return;
    }

    if (ls.lastChange !== undefined && time - ls.lastChange < MIN_CHANGE_GAP) return;
    const want = new Map([[midi, 0.4]]);
    if (tense) want.set(midi + 1, 0.12);
    const key = [...want.keys()].join();
    if (key === ls.lastKey) return;
    holdNotes(layerInst, ls, want, time);
    ls.lastKey = key;
    ls.lastChange = time;
  });
}

/**
 * Scan mode: one column (0 = west edge) as a short chord.
 *  - pan follows the column (longitude)
 *  - latitude picks the octave: the column's rows are split into south / middle / north bands,
 *    each band plays in its own octave (north highest), and the band's mean value picks the note
 *  - falls back to features.columns[col] when there is no per-cell data
 * @returns {string[]} note names played
 */
export function scanColumn(features, cfg, inst, time, col) {
  const voice = inst;
  const gw = cfg.grid?.w ?? 32;
  const gh = cfg.grid?.h ?? 16;
  const [min, max] = valueRange(cfg);
  const { lo, hi, scale } = soundOpts(cfg);

  const midis = [];
  if (features.grid) {
    const bands = Math.min(3, hi - lo + 1);
    for (let b = 0; b < bands; b++) {
      // b = 0 is the south band (bottom rows); rows are stored north → south.
      const rows = [];
      const y0 = Math.floor(gh - ((b + 1) * gh) / bands);
      const y1 = Math.floor(gh - (b * gh) / bands);
      for (let y = y0; y < y1; y++) rows.push(features.grid[y * gw + col]);
      const m = mean(rows);
      if (m !== null) midis.push(valueToMidi(m, min, max, lo + b, lo + b, scale));
    }
  }
  if (!midis.length) {
    const v = features.columns?.[col];
    const midi = valueToMidi(v, min, max, lo, hi, scale);
    if (midi !== null) midis.push(midi);
  }
  const names = [...new Set(midis)].sort((a, b) => a - b).map(midiToNote);
  if (!names.length) return [];

  voice.panner?.pan.setValueAtTime(colToPan(col, gw), time);
  // Aerosols have no single instrument: scan through the loudest layer of the last frame.
  const target = voice.inst ?? voice.layers[voice.state.loudest] ?? Object.values(voice.layers)[0];
  if (target.percussive) {
    const st = voice.state;
    const t = Math.max(time, (st.lastHit ?? 0) + 0.01);
    target.triggerAttackRelease(names[0], '16n', t, 0.6); // monophonic: lowest note only
    st.lastHit = t;
    return names.slice(0, 1);
  }
  names.forEach((n) => target.triggerAttackRelease(n, '8n', time, 0.3));
  return names;
}

export const MAPPERS = { continuousField, events, density, layers };
