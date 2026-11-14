// Owner: Freia · Support: Jaden
// Musical scales: map a data value onto a note so the music always sounds consonant.

import * as Tone from 'https://esm.sh/tone@15.1.22';

export const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];

/**
 * Map a value in [min, max] to a note name in C major pentatonic.
 * Low values → low notes, high values → high notes.
 *
 * @param {number|null} v data value
 * @param {number} min value mapped to the lowest note
 * @param {number} max value mapped to the highest note
 * @param {number} [lowOct=3] lowest octave
 * @param {number} [highOct=5] highest octave (inclusive)
 * @returns {string|null} note name such as "E4", or null if v is null
 */
export function valueToNote(v, min, max, lowOct = 3, highOct = 5) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;

  const notes = [];
  for (let oct = lowOct; oct <= highOct; oct++) {
    for (const step of MAJOR_PENTATONIC) notes.push(12 * (oct + 1) + step); // C4 = MIDI 60
  }

  const span = max - min || 1;
  const t = Math.min(1, Math.max(0, (v - min) / span));
  const midi = notes[Math.round(t * (notes.length - 1))];
  return Tone.Frequency(midi, 'midi').toNote();

  // TODO(Freia): support other scales by name (cfg.sound.scale), e.g. minor pentatonic for
  // "tension" when values pass cfg.sound.tensionAbove.
}
