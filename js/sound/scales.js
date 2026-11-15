// Owner: Freia · Support: Jaden
// Musical scales: map a data value onto a note so the music always sounds consonant.

import * as Tone from 'https://esm.sh/tone@15.1.22';

export const SCALES = {
  'major pentatonic': [0, 2, 4, 7, 9],
  'minor pentatonic': [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};
export const MAJOR_PENTATONIC = SCALES['major pentatonic'];

const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Parse a scale name like "C major pentatonic", "A minor pentatonic" or "D major".
 * Unknown names fall back to C major pentatonic.
 * @returns {{ root: number, steps: number[] }} root = semitones above C
 */
export function parseScale(name = 'C major pentatonic') {
  const m = /^\s*([A-G])([#b]?)\s+(.+?)\s*$/i.exec(name);
  if (!m) return { root: 0, steps: MAJOR_PENTATONIC };
  let root = ROOTS[m[1].toUpperCase()];
  if (m[2] === '#') root += 1;
  if (m[2] === 'b') root -= 1;
  const steps = SCALES[m[3].toLowerCase()] ?? MAJOR_PENTATONIC;
  return { root: (root + 12) % 12, steps };
}

const cache = new Map();

/** All MIDI notes of a scale between lowOct and highOct (inclusive), low → high. */
export function scaleNotes(lowOct = 3, highOct = 5, scale = 'C major pentatonic') {
  const key = `${lowOct}|${highOct}|${scale}`;
  if (cache.has(key)) return cache.get(key);
  const { root, steps } = parseScale(scale);
  const notes = [];
  for (let oct = lowOct; oct <= highOct; oct++) {
    for (const step of steps) notes.push(12 * (oct + 1) + root + step); // C4 = MIDI 60
  }
  cache.set(key, notes);
  return notes;
}

/** Normalise v into 0..1 within [min, max] (clamped). */
export function norm(v, min, max) {
  const span = max - min || 1;
  return Math.min(1, Math.max(0, (v - min) / span));
}

/**
 * Map a value in [min, max] to a MIDI note on the scale.
 * @returns {number|null}
 */
export function valueToMidi(v, min, max, lowOct = 3, highOct = 5, scale = 'C major pentatonic') {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const notes = scaleNotes(lowOct, highOct, scale);
  return notes[Math.round(norm(v, min, max) * (notes.length - 1))];
}

/**
 * Map a value in [min, max] to a note name on the scale (default C major pentatonic).
 * Low values → low notes, high values → high notes.
 *
 * @param {number|null} v data value
 * @param {number} min value mapped to the lowest note
 * @param {number} max value mapped to the highest note
 * @param {number} [lowOct=3] lowest octave
 * @param {number} [highOct=5] highest octave (inclusive)
 * @param {string} [scale='C major pentatonic'] scale name, e.g. cfg.sound.scale
 * @returns {string|null} note name such as "E4", or null if v is null
 */
export function valueToNote(v, min, max, lowOct = 3, highOct = 5, scale = 'C major pentatonic') {
  const midi = valueToMidi(v, min, max, lowOct, highOct, scale);
  return midi === null ? null : midiToNote(midi);
}

export function midiToNote(midi) {
  return Tone.Frequency(midi, 'midi').toNote();
}

/** Data range of a dataset: first and last colorbar stop. */
export function valueRange(cfg) {
  const stops = cfg.colorbar?.stops ?? [];
  if (stops.length < 2) return [0, 1];
  return [stops[0].value, stops[stops.length - 1].value];
}
