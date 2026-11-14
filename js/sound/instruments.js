// Owner: Freia · Support: Jaden
// Instrument factory. Every instrument is a simple Tone.js synth for now — placeholders
// to be replaced with nicer sounds. All instruments accept triggerAttackRelease(note, dur, time).

import * as Tone from 'https://esm.sh/tone@15.1.22';

const FACTORIES = {
  // Sea surface temperature: soft sustained pad.
  // TODO(Freia): add chorus / slow filter movement driven by features.change.
  warmPad: () => new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.4, decay: 0.3, sustain: 0.6, release: 1.5 },
    volume: -12,
  }),

  // Lightning: short percussive hit per flash.
  // TODO(Freia): pan by flash x position, louder for brighter flashes.
  drum: () => new Tone.MembraneSynth({ volume: -10 }),

  // Night lights: bright, sparkly bell tones; more lights → more notes.
  glass: () => new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3,
    modulationIndex: 8,
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 1.2 },
    volume: -16,
  }),

  // Aerosol layers — one voice per aerosol type.
  // TODO(Freia): give each layer a clearly different timbre (noise-based dust/smoke, etc.).
  dust: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, volume: -20 }),
  smoke: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'square' }, volume: -22 }),
  salt: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, volume: -14 }),
  sulfate: () => new Tone.PolySynth(Tone.AMSynth, { volume: -18 }),
};

/**
 * Create an instrument by name and connect it to a destination node.
 * Unknown names fall back to warmPad so the app never goes silent.
 * @param {string} name e.g. "warmPad"
 * @param {Tone.ToneAudioNode} destination
 */
export function makeInstrument(name, destination) {
  const make = FACTORIES[name] ?? FACTORIES.warmPad;
  const inst = make();
  inst.connect(destination);
  return inst;
}

export const INSTRUMENT_NAMES = Object.keys(FACTORIES);
