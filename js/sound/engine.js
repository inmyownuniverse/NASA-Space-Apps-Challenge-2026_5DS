// Owner: Freia · Support: Jaden
// Sound engine: master chain, current instrument, and per-frame playback.
//
// Master chain: instrument → Volume(-8) → Reverb(decay 4, wet 0.25) → Limiter(-3) → speakers

import * as Tone from 'https://esm.sh/tone@15.1.22';
import { valueToNote } from './scales.js';
import { makeInstrument } from './instruments.js';
// import { MAPPERS } from './mappers.js'; // TODO(Freia): dispatch to cfg.sound.mapper

let started = false;
let master = null;   // Tone.Volume — instruments connect here
let inst = null;
let currentCfg = null;

/** Start audio. Must be called from a user gesture (click / key press). Safe to call twice. */
export async function initAudio() {
  if (started) return;
  await Tone.start();

  const limiter = new Tone.Limiter(-3).toDestination();
  const reverb = new Tone.Reverb({ decay: 4, wet: 0.25 }).connect(limiter);
  master = new Tone.Volume(-8).connect(reverb);

  started = true;
  if (currentCfg) loadDataset(currentCfg);
}

/** Prepare instruments for a dataset. If audio isn't started yet, this happens in initAudio. */
export function loadDataset(cfg) {
  currentCfg = cfg;
  if (!started) return;

  releaseAll();
  inst?.dispose();
  const name = cfg.sound.instrument ?? cfg.sound.instruments?.[0] ?? 'warmPad';
  inst = makeInstrument(name, master);
  // TODO(Freia): aerosols need one instrument per layer (cfg.sound.instruments).
}

/**
 * Play the sound for one analysed frame.
 * @param {object} features from analyzer.analyze
 * @param {object} cfg dataset config
 * @param {number} time media time in seconds (for mappers that care about position)
 */
export function playFrame(features, cfg, time) {
  if (!started || !inst) return;

  // Stub: one soft note from the frame's mean value so the app makes sound end to end.
  // TODO(Freia): replace with MAPPERS[cfg.sound.mapper](features, cfg, inst, Tone.now()).
  const stops = cfg.colorbar.stops;
  const min = stops[0].value;
  const max = stops[stops.length - 1].value;
  const [lowOct, highOct] = cfg.sound.octaves ?? [3, 5];
  const note = valueToNote(features.mean, min, max, lowOct, highOct);
  if (!note) return;

  inst.triggerAttackRelease(note, '4n', Tone.now() + 0.01, 0.4);
}

/** Stop all sounding notes (pause, seek, dataset switch, Esc). */
export function releaseAll() {
  if (!inst) return;
  if (typeof inst.releaseAll === 'function') inst.releaseAll();
  else inst.triggerRelease?.();
}

/** Master volume in decibels (used by the volume slider). */
export function setVolume(db) {
  if (master) master.volume.rampTo(db, 0.05);
}
