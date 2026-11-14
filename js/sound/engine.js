// Owner: Freia · Support: Jaden
// Sound engine: master chain, the current dataset's voice, Scan mode and Planet Symphony.
//
// One dataset:   instrument(s) → [layer volume] → Panner → Filter ──────────────┐
// Symphony:      each dataset's voice → its own Tone.Channel (level) ───────────┤
// Master chain:  Volume(-8) → Reverb(decay 4, wet 0.25) → Limiter(-3) → speakers ◄┘

import * as Tone from 'https://esm.sh/tone@15.1.22';
import { makeInstrument, disposeInstrument } from './instruments.js';
import { MAPPERS, continuousField, events, scanColumn } from './mappers.js';
import { valueToMidi, midiToNote, valueRange, scaleNotes } from './scales.js';

const LOOK_AHEAD = 0.05; // s — schedule slightly ahead so notes start cleanly
const SCAN_BPM = 90;     // Scan mode: one column per 16th note at 90 BPM

let started = false;
let master = null;   // Tone.Volume — everything connects here
let voice = null;    // single-dataset voice (see makeVoice)
let currentCfg = null;
let symphony = null; // { [id]: { cfg, voice, channel } } while Planet Symphony is loaded
let scanId = null;

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

/**
 * Build the voice bundle that mappers receive as their `inst` argument:
 * { inst, layers, layerGains, filter, panner, state }
 */
function makeVoice(cfg, destination) {
  const s = cfg.sound;
  const filter = new Tone.Filter({ frequency: (s.filter ?? [500, 5000])[1], type: 'lowpass', rolloff: -12 }).connect(destination);
  const panner = new Tone.Panner(0).connect(filter);
  const v = { inst: null, layers: {}, layerGains: {}, filter, panner, state: {} };

  if (s.mapper === 'layers') {
    for (const name of s.instruments ?? []) {
      const gain = new Tone.Volume(-60).connect(panner);
      v.layerGains[name] = gain;
      v.layers[name] = makeInstrument(name, gain);
    }
  } else {
    v.inst = makeInstrument(s.instrument ?? 'warmPad', panner);
  }
  return v;
}

function disposeVoice(v) {
  if (!v) return;
  disposeInstrument(v.inst);
  Object.values(v.layers).forEach(disposeInstrument);
  Object.values(v.layerGains).forEach((g) => g.dispose());
  v.panner.dispose();
  v.filter.dispose();
}

function releaseVoice(v) {
  if (!v) return;
  for (const inst of [v.inst, ...Object.values(v.layers)]) {
    if (!inst) continue;
    if (typeof inst.releaseAll === 'function') inst.releaseAll();
    else inst.triggerRelease?.();
  }
  v.state = {}; // mappers re-attack held notes on the next frame
}

function disposeSymphony() {
  if (!symphony) return;
  for (const part of Object.values(symphony)) {
    disposeVoice(part.voice);
    part.channel.dispose();
  }
  symphony = null;
}

/** Prepare instruments for one dataset. If audio isn't started yet, this happens in initAudio. */
export function loadDataset(cfg) {
  currentCfg = cfg;
  if (!started) return;

  stopScan();
  releaseAll();
  disposeSymphony();
  disposeVoice(voice);
  voice = makeVoice(cfg, master);
}

/**
 * Play the sound for one analysed frame using the dataset's mapper (cfg.sound.mapper).
 * @param {object} features from analyzer.analyze
 * @param {object} cfg dataset config
 * @param {number} time media time in seconds (not used by the mappers yet)
 */
export function playFrame(features, cfg, time) {
  if (!started || !voice) return;
  const mapper = MAPPERS[cfg.sound.mapper] ?? continuousField;
  mapper(features, cfg, voice, Tone.now() + LOOK_AHEAD);
}

// ---------- Scan mode ----------

/**
 * Play one column of the frame (0 = west edge) as a short chord, right now.
 * @returns {string[]} note names played (handy for the readout)
 */
export function playScanColumn(features, cfg, col) {
  if (!started || !voice) return [];
  return scanColumn(features, cfg, voice, Tone.now() + LOOK_AHEAD, col);
}

/**
 * Start Scan mode: Tone.Transport steps through the columns west → east,
 * one column per 16th note at 90 BPM, each column played as a chord. Loops until stopScan().
 * For player.js: pause the video, then
 *   startScan(cfg, () => latestFeatures, (col, notes) => drawScanLine(col));
 * @param {object} cfg dataset config
 * @param {() => object} getFeatures returns the features of the (paused) frame
 * @param {(col: number, notes: string[]) => void} [onColumn] called in sync with the sound,
 *        e.g. to draw the scan line or update the readout
 */
export function startScan(cfg, getFeatures, onColumn) {
  if (!started || !voice) return;
  stopScan();
  const transport = Tone.getTransport();
  const gw = cfg.grid?.w ?? 32;
  let step = 0;
  transport.bpm.value = SCAN_BPM;
  scanId = transport.scheduleRepeat((time) => {
    const col = step++ % gw;
    const features = getFeatures();
    const notes = features ? scanColumn(features, cfg, voice, time, col) : [];
    if (onColumn) Tone.getDraw().schedule(() => onColumn(col, notes), time);
  }, '16n');
  transport.start();
}

/** Stop Scan mode (safe to call when not scanning). */
export function stopScan() {
  if (scanId === null) return;
  const transport = Tone.getTransport();
  transport.clear(scanId);
  transport.stop();
  scanId = null;
}

// ---------- Planet Symphony ----------

/**
 * Load several datasets to play together, each on its own Tone.Channel so levels
 * can be mixed per layer. Default level per dataset: cfg.sound.symphonyLevel (dB).
 * @param {object[]} cfgs dataset configs
 */
export function loadSymphony(cfgs) {
  if (!started) return;
  stopScan();
  releaseAll();
  disposeVoice(voice);
  voice = null;
  disposeSymphony();
  symphony = {};
  for (const cfg of cfgs) {
    const channel = new Tone.Channel({ volume: cfg.sound.symphonyLevel ?? -6 }).connect(master);
    symphony[cfg.id] = { cfg, channel, voice: makeVoice(cfg, channel) };
  }
}

/**
 * Play one frame of every Symphony dataset.
 * @param {{ [id: string]: object }} featuresById features per dataset id (missing ids are skipped)
 */
export function playSymphonyFrame(featuresById) {
  if (!started || !symphony) return;
  const t = Tone.now() + LOOK_AHEAD;
  for (const [id, part] of Object.entries(symphony)) {
    const features = featuresById[id];
    if (!features) continue;
    const mapper = MAPPERS[part.cfg.sound.mapper] ?? continuousField;
    mapper(features, part.cfg, part.voice, t);
  }
}

/** Set one Symphony layer's level in dB (e.g. from a mixer slider). */
export function setSymphonyLevel(id, db) {
  symphony?.[id]?.channel.volume.rampTo(db, 0.1);
}

// ---------- legend ----------

/**
 * Play the example sound for legend line i (cfg.legend[i]), described by
 * cfg.sound.legendExamples[i]. For main.js: call it as each legend line is spoken.
 * Example shapes:
 *   { "values": [30] }                                 notes for these data values
 *   { "values": [15], "sweep": true }                  a note with the filter sweeping open
 *   { "flashes": [{ "x": 0, "y": 8, "value": 1 }] }    drum hits (lightning)
 *   { "layer": "dust" }                                that aerosol layer on its own
 */
export function playLegendSample(cfg, i) {
  if (!started || !voice) return;
  const ex = cfg.sound.legendExamples?.[i];
  if (!ex) return;

  const t = Tone.now() + LOOK_AHEAD;
  const [min, max] = valueRange(cfg);
  const [lo, hi] = cfg.sound.octaves ?? [3, 5];
  const scale = cfg.sound.scale;

  if (ex.flashes) {
    events({ flashes: ex.flashes }, cfg, voice, t);
  } else if (ex.layer) {
    const inst = voice.layers[ex.layer];
    const gain = voice.layerGains[ex.layer];
    if (!inst || !gain) return;
    const notes = scaleNotes(lo, hi, scale);
    const midi = notes[Math.floor(notes.length / 2)] + (inst.octaveUp ? 12 : 0);
    gain.volume.cancelScheduledValues(t);
    gain.volume.setValueAtTime(-6, t);
    gain.volume.setValueAtTime(-60, t + 2.5);
    inst.triggerAttackRelease(midiToNote(midi), 1.5, t, 0.6);
  } else if (ex.values && voice.inst) {
    if (ex.sweep) {
      const [fMin, fMax] = cfg.sound.filter ?? [500, 5000];
      voice.filter.frequency.cancelScheduledValues(t);
      voice.filter.frequency.setValueAtTime(fMin, t);
      voice.filter.frequency.exponentialRampToValueAtTime(fMax, t + 1.5);
    }
    ex.values.forEach((v, k) => {
      const midi = valueToMidi(v, min, max, lo, hi, scale);
      if (midi !== null) voice.inst.triggerAttackRelease(midiToNote(midi), ex.sweep ? 1.8 : 0.8, t + k * 0.15, 0.5);
    });
  }
}

// ---------- shared ----------

/** Stop all sounding notes (pause, seek, dataset switch, Esc). */
export function releaseAll() {
  releaseVoice(voice);
  if (symphony) Object.values(symphony).forEach((p) => releaseVoice(p.voice));
}

/** Master volume in decibels (used by the volume slider). */
export function setVolume(db) {
  if (master) master.volume.rampTo(db, 0.05);
}
