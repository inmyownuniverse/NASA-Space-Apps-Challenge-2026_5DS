// Owner: Freia · Support: Jaden
// Mapping rules: turn features into notes. One mapper per kind of visualization.
// Every mapper has the same signature: (features, cfg, inst, time)
//   features — from analyzer.analyze (see js/analyzer.js)
//   cfg      — dataset config after tuning.js is applied (engine.js does this), so
//              cfg.sound holds every setting; the mapper is chosen by cfg.sound.mapper
//   inst     — the voice bundle built by engine.js:
//              { inst, layers: { name: instrument }, layerGains: { name: Tone.Volume },
//                filter: Tone.Filter, panner: Tone.Panner, state: {} }
//   time     — audio-context time to schedule notes at
//
// Rules shared by every dataset:
//   - all notes snap to the dataset's scale (cfg.sound.scale, default C major pentatonic)
//   - at most cfg.sound.maxVoices notes at once (never more than TUNING.master.voiceCap)
//   - values smoothed over cfg.sound.smoothFrames frames (running average)
//   - stereo pan follows longitude (column): −1 west … +1 east
//   - extreme values (above cfg.sound.tensionAbove) add a voice one semitone up
//
// Every number used here (timings, velocities, levels) is a setting in tuning.js.

import { valueToMidi, midiToNote, valueRange, norm, scaleNotes } from './scales.js';
import { TUNING } from './tuning.js';

export const SILENT_DB = -60; // volume used for "off" (a layer that is absent)

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
    maxVoices: Math.min(TUNING.master.voiceCap, s.maxVoices ?? 6),
    smoothFrames: s.smoothFrames ?? 3,
  };
}

/** Column → stereo pan, −1 (west) … +1 (east). */
function colToPan(col, gw) {
  return gw > 1 ? Math.max(-1, Math.min(1, -1 + (2 * col) / (gw - 1))) : 0;
}

/**
 * features.change (0..1) → filter cutoff, exponential between cfg.sound.filter [min, max].
 * sound.changeRange [low, high] (measured on the real video) maps low to the darkest tone and high
 * to the brightest; without it, change × changeBoost is used.
 */
function changeToCutoff(change, cfg) {
  const s = cfg.sound;
  const [fMin, fMax] = s.filter ?? [500, 5000];
  const c = s.changeRange
    ? norm(change ?? 0, s.changeRange[0], s.changeRange[1])
    : Math.min(1, Math.max(0, (change ?? 0) * (s.changeBoost ?? 4))); // change is usually small
  return fMin * Math.pow(fMax / fMin, c);
}

function applyChange(features, cfg, voice) {
  if (cfg.sound.changeTo === 'filter' && voice.filter) {
    voice.filter.frequency.rampTo(changeToCutoff(features.change, cfg), cfg.sound.filterGlide ?? 0.3);
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
 * Notes are held and only change when the chord changes (at most every chordChangeGap s).
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
  if (st.lastChange !== undefined && time - st.lastChange < (s.chordChangeGap ?? 0.5)) return;

  // Skip tension on sample data: its max is a fixed placeholder, not a measurement.
  const tense = !features.fake && s.tensionAbove !== undefined &&
    features.max !== null && features.max !== undefined && features.max > s.tensionAbove;
  const budget = tense ? maxVoices - 1 : maxVoices;

  // The main note can use its own value range (rootRange: the range the average really moves in)
  // and octaves (rootOctaves), so a small but real change in the average is still heard.
  const [rMin, rMax] = s.rootRange ?? [min, max];
  const [rLo, rHi] = s.rootOctaves ?? [lo, hi];
  const root = valueToMidi(avg, rMin, rMax, rLo, rHi, scale);
  const notes = new Map([[root, s.rootVelocity ?? 0.35]]);
  const vals = validValues(features.grid);
  for (const p of [0.1, 0.9, 0.5, 0.25, 0.75, 0.0, 1.0]) {
    if (notes.size >= budget || !vals.length) break;
    const midi = valueToMidi(percentile(vals, p), min, max, lo, hi, scale);
    if (!notes.has(midi)) notes.set(midi, s.extraVelocity ?? 0.2);
  }
  if (tense) notes.set(root + 1, s.tensionVelocity ?? 0.12);

  const key = [...notes.keys()].sort((a, b) => a - b).join(',');
  if (key === st.lastKey) return;
  holdNotes(voice.inst, st, notes, time);
  st.lastKey = key;
  st.lastChange = time;
}

/**
 * Discrete events (lightning): one drum hit per new flash.
 *  - features.flashes from the analyser: [{ cell, intensity, ... }] where cell = row * gw + col
 *    and intensity is relative brightness 0..100. Sample data uses [{ x, y, value }] in grid cells.
 *  - pan by column (left of the screen = left ear), pitch by row (top of the screen = higher)
 *  - velocity by flash brightness; at most maxVoices hits per frame, brightest first
 */
/**
 * How many drum hits to play for this frame's new flashes. Without sound.flashCountRange, one hit
 * per flash (up to maxVoices). With it, [few, many] new flashes per frame map to 1 .. maxVoices hits,
 * so a quiet moment and a huge storm sound different instead of both maxing out.
 */
function flashHits(count, cfg, maxVoices) {
  const r = cfg.sound.flashCountRange;
  if (!r) return Math.min(count, maxVoices);
  return Math.min(count, 1 + Math.round(norm(count, r[0], r[1]) * (maxVoices - 1)));
}

function flashCell(f, gw) {
  if (Number.isInteger(f.cell)) return [f.cell % gw, Math.floor(f.cell / gw)];
  return [f.x, f.y];
}

/** Flash brightness 0..1: analyser intensity (scaled by sound.intensityRange) or sample value. */
function flashStrength(f, cfg) {
  if (Number.isFinite(f.intensity)) {
    const [lo, hi] = cfg.sound.intensityRange ?? [0, 100];
    return norm(f.intensity, lo, hi);
  }
  const [min, max] = valueRange(cfg);
  return norm(f.value ?? max, min, max);
}

export function events(features, cfg, inst, time) {
  const voice = inst;
  const s = cfg.sound;
  const flashes = features.flashes ?? [];
  if (!flashes.length) return;

  const st = voice.state;
  const gw = cfg.grid?.w ?? 32;
  const gh = cfg.grid?.h ?? 16;
  const { lo, hi, scale, maxVoices } = soundOpts(cfg);

  const hits = [...flashes]
    .map((f) => ({ f, strength: flashStrength(f, cfg) }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, flashHits(flashes.length, cfg, maxVoices));
  // Monophonic drum: every hit must start strictly after the previous one.
  let t = Math.max(time, (st.lastHit ?? 0) + 0.03);
  for (const { f, strength } of hits) {
    const [col, row] = flashCell(f, gw);
    voice.panner?.pan.setValueAtTime(colToPan(col, gw), t);
    const midi = valueToMidi(gh - 1 - row, 0, gh - 1, lo, hi, scale);
    const soft = s.softestHit ?? 0.3;
    const vel = soft + (1 - soft) * strength;
    voice.inst.triggerAttackRelease(midiToNote(midi), s.hitLength ?? '16n', t, vel);
    st.lastHit = t;
    t += s.hitSpacing ?? 0.06;
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
  const gap = s.burstGap ?? 0.5;
  if (st.lastBurst !== undefined && time - st.lastBurst < gap) return;

  const [min, max] = valueRange(cfg);
  const { lo, hi, scale, maxVoices } = soundOpts(cfg);
  // pitchRange: the values lit cells really have, so they use the whole pitch range.
  const [pMin, pMax] = s.pitchRange ?? [min, max];
  const play = (value, t, vel) => {
    const midi = valueToMidi(value, pMin, pMax, lo, hi, scale);
    if (midi !== null) voice.inst.triggerAttackRelease(midiToNote(midi), s.noteLength ?? '8n', t, vel);
  };

  const vals = validValues(features.grid);
  if (!vals.length) {
    if (features.mean === null || features.mean === undefined) return;
    play(features.mean, time, s.softestNote ?? 0.15);
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

  // litShareRange [low, high]: lit shares measured on the real video map to 1 .. maxVoices notes.
  const n = s.litShareRange
    ? 1 + Math.round(norm(frac, s.litShareRange[0], s.litShareRange[1]) * (maxVoices - 1))
    : Math.max(1, Math.min(maxVoices, Math.round(frac * maxVoices * (s.notesPerLitShare ?? 2))));
  const spacing = (gap * 0.9) / n;
  const soft = s.softestNote ?? 0.15, loud = s.loudestNote ?? 0.6;
  for (let i = 0; i < n; i++) {
    const v = lit[Math.round((n === 1 ? 1 : i / (n - 1)) * (lit.length - 1))];
    play(v, time + i * spacing, soft + (loud - soft) * norm(v, pMin, pMax));
  }
  if (growth > (s.sparkleGrowth ?? 0.01)) play(pMax, time + gap * 0.5, s.sparkleVelocity ?? 0.25);
}

/**
 * Layers (aerosols): one instrument per aerosol type on a shared chord.
 *  - layer i plays chord tone i (dust lowest … sulfate highest), so the layers blend
 *  - the whole chord shifts up slightly with the overall mean value
 *  - features.layers[key] (0..1) → that layer's volume (absent → silent); key is
 *    sound.layerKeys[instrument name] when the analyser uses different names (black_carbon ...)
 *  - sustaining layers hold their note; percussive layers (bells) are re-struck every bellGap s
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
  const [shMin, shMax] = s.shiftRange ?? [min, max]; // range the overall amount really moves in
  const shift = avg === null ? 0 : Math.round(norm(avg, shMin, shMax) * (s.chordShift ?? 2)); // scale steps
  const silentBelow = s.silentBelow ?? 0.02;
  const quiet = s.quietestLayer ?? -18, loud = s.loudestLayer ?? -6;
  st.loudestStrength = -1;

  names.forEach((name, i) => {
    const layerInst = voice.layers[name];
    const gain = voice.layerGains[name];
    if (!layerInst || !gain) return;

    const layerKey = s.layerKeys?.[name] ?? name;
    const raw = hasLayers ? (features.layers[layerKey] ?? 0) : (s.placeholderStrength ?? 0.3);
    // layerScale stretches the measured range so a typical strong layer reaches full volume.
    const strength = Math.min(1, raw * (hasLayers ? (s.layerScale ?? 1) : 1));
    const db = strength <= silentBelow ? SILENT_DB : quiet + (loud - quiet) * strength;
    gain.volume.rampTo(db, s.layerFade ?? 0.5);
    if (strength > st.loudestStrength) { st.loudest = name; st.loudestStrength = strength; }

    const idx = Math.min(notes.length - 1, Math.round(((i + 0.5) / names.length) * (notes.length - 3)) + shift);
    const midi = notes[idx] + (layerInst.octaveUp ? 12 : 0);
    const ls = (st[name] ??= {});
    const tense = hasLayers && s.tensionAbove !== undefined && strength > s.tensionAbove;

    if (layerInst.percussive) {
      if (strength <= silentBelow) return;
      if (ls.lastStrike !== undefined && time - ls.lastStrike < (s.bellGap ?? 1.2)) return;
      const soft = s.bellSoftest ?? 0.3, hard = s.bellLoudest ?? 0.8;
      layerInst.triggerAttackRelease(midiToNote(midi + (tense ? 1 : 0)), 1, time, soft + (hard - soft) * strength);
      ls.lastStrike = time;
      return;
    }

    if (ls.lastChange !== undefined && time - ls.lastChange < (s.chordChangeGap ?? 0.5)) return;
    const want = new Map([[midi, s.layerVelocity ?? 0.4]]);
    if (tense) want.set(midi + 1, s.tensionVelocity ?? 0.12);
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

  const sc = TUNING.scan;
  voice.panner?.pan.setValueAtTime(colToPan(col, gw), time);
  // Aerosols have no single instrument: scan through the loudest layer of the last frame
  // (the first non-bell layer if nothing has played yet), and make sure that layer is audible.
  let target = voice.inst;
  if (!target) {
    const layerNames = Object.keys(voice.layers);
    const name = voice.state.loudest ?? layerNames.find((n) => !voice.layers[n].percussive) ?? layerNames[0];
    target = voice.layers[name];
    const gain = voice.layerGains[name];
    if (gain && !voice.state.scanLevelSet) {
      gain.volume.setValueAtTime(Math.max(gain.volume.value, sc.layerLevel), time);
      voice.state.scanLevelSet = true;
    }
  }
  if (!target) return [];
  if (target.percussive) {
    const st = voice.state;
    const t = Math.max(time, (st.lastHit ?? 0) + 0.01);
    target.triggerAttackRelease(names[0], sc.step, t, sc.drumVelocity); // monophonic: lowest note only
    st.lastHit = t;
    return names.slice(0, 1);
  }
  names.forEach((n) => target.triggerAttackRelease(n, sc.noteLength, time, sc.velocity));
  return names;
}

export const MAPPERS = { continuousField, events, density, layers };
