// Owner: Freia · Support: Jaden
// Sound engine: master chain, the current dataset's voice, Scan mode and Planet Symphony.
//
// One dataset:   instrument(s) → [layer volume] → Panner → Filter → Level ───────┐
// Symphony:      each dataset's voice → its own Tone.Channel (level) ───────────┤
// Master chain:  mix trim → duck → listener volume → Reverb → Limiter → speakers ◄────────────────────────────┘
//
// Every number that changes the sound is in tuning.js. Configs passed in from outside
// (datasets/*.json) are merged with tuning.js by tuned(cfg) before the mappers see them.

import * as Tone from 'https://esm.sh/tone@15.1.22';
import { makeInstrument, disposeInstrument } from './instruments.js';
import { MAPPERS, continuousField, events, scanColumn, SILENT_DB } from './mappers.js';
import { valueToMidi, midiToNote, valueRange, scaleNotes } from './scales.js';
import { TUNING, tuned, tuningChanged } from './tuning.js';

let started = false;
let master = null;   // Tone.Volume — everything connects here (mix trim from tuning.js)
let listener = null; // Tone.Volume — the listener's volume slider (setVolume)
let listenerDb = -8; // slider value, kept so it survives retune and late initAudio
let duck = null;     // Tone.Volume — dips the music while speech plays (duckMusic)
let reverb = null;
let limiter = null;
let meter = null;    // Tone.Meter on the final output (used by the sound lab)
let voice = null;    // single-dataset voice (see makeVoice)
let currentCfg = null;
let symphony = null; // { [id]: { cfg, voice, channel } } while Planet Symphony is loaded
let symphonyCfgs = null;
let scanId = null;

const lookAhead = () => TUNING.master.lookAhead;

/** Start audio. Must be called from a user gesture (click / key press). Safe to call twice. */
export async function initAudio() {
  if (started) return;
  await Tone.start();

  const m = TUNING.master;
  limiter = new Tone.Limiter(m.limiter).toDestination();
  reverb = new Tone.Reverb({ decay: m.reverbDecay, wet: m.reverbWet }).connect(limiter);
  listener = new Tone.Volume(listenerDb).connect(reverb);
  duck = new Tone.Volume(0).connect(listener);
  master = new Tone.Volume(m.volume).connect(duck);
  meter = new Tone.Meter({ smoothing: 0.8 });
  limiter.connect(meter);

  started = true;
  if (currentCfg) loadDataset(currentCfg);
}

/**
 * Build the voice bundle that mappers receive as their `inst` argument:
 * { inst, layers, layerGains, filter, panner, level, state }
 * @param {object} cfg tuned dataset config
 */
function makeVoice(cfg, destination) {
  const s = cfg.sound;
  const level = new Tone.Volume(s.level ?? 0).connect(destination);
  const filter = new Tone.Filter({ frequency: (s.filter ?? [500, 5000])[1], type: 'lowpass', rolloff: -12 }).connect(level);
  const panner = new Tone.Panner(0).connect(filter);
  const v = { inst: null, layers: {}, layerGains: {}, filter, panner, level, state: {} };

  if (s.mapper === 'layers') {
    for (const name of s.instruments ?? []) {
      const gain = new Tone.Volume(SILENT_DB).connect(panner);
      v.layerGains[name] = gain;
      v.layers[name] = makeInstrument(name, gain, s);
    }
  } else {
    v.inst = makeInstrument(s.instrument ?? 'warmPad', panner, s);
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
  v.level.dispose();
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
  symphonyCfgs = null;
}

/** Prepare instruments for one dataset. If audio isn't started yet, this happens in initAudio. */
export function loadDataset(cfg) {
  currentCfg = cfg;
  if (!started) return;

  stopScan();
  releaseAll();
  disposeSymphony();
  disposeVoice(voice);
  voice = makeVoice(tuned(cfg), master);
}

/**
 * Play the sound for one analysed frame using the dataset's mapper (cfg.sound.mapper).
 * @param {object} features from analyzer.analyze
 * @param {object} cfg dataset config
 * @param {number} time media time in seconds (not used by the mappers yet)
 */
export function playFrame(features, cfg, time) {
  if (!started || !voice) return;
  const c = tuned(cfg);
  const mapper = MAPPERS[c.sound.mapper] ?? continuousField;
  mapper(features, c, voice, Tone.now() + lookAhead());
}

// ---------- Scan mode ----------

/**
 * Play one column of the frame (0 = west edge) as a short chord, right now.
 * @returns {string[]} note names played (handy for the readout)
 */
export function playScanColumn(features, cfg, col) {
  if (!started || !voice) return [];
  return scanColumn(features, tuned(cfg), voice, Tone.now() + lookAhead(), col);
}

/**
 * Start Scan mode: Tone.Transport steps through the columns west → east,
 * one column per TUNING.scan.step at TUNING.scan.bpm, each column played as a chord.
 * Loops until stopScan().
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
  transport.bpm.value = TUNING.scan.bpm;
  scanId = transport.scheduleRepeat((time) => {
    const col = step++ % gw;
    const features = getFeatures();
    const notes = features ? scanColumn(features, tuned(cfg), voice, time, col) : [];
    if (onColumn) Tone.getDraw().schedule(() => onColumn(col, notes), time);
  }, TUNING.scan.step);
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

/** True while Scan mode is running. */
export function isScanning() {
  return scanId !== null;
}

// ---------- Planet Symphony ----------

/**
 * Load several datasets to play together, each on its own Tone.Channel so levels
 * can be mixed per layer. Each channel starts at the dataset's symphonyLevel in tuning.js (dB),
 * on top of the dataset's normal level.
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
  symphonyCfgs = cfgs;
  for (const cfg of cfgs) {
    const c = tuned(cfg);
    const channel = new Tone.Channel({ volume: c.sound.symphonyLevel ?? -6 }).connect(master);
    // The voice keeps its own level (which balances the datasets); the channel adds symphonyLevel.
    const v = makeVoice(c, channel);
    symphony[cfg.id] = { cfg, channel, voice: v };
  }
}

/**
 * Play one frame of every Symphony dataset.
 * @param {{ [id: string]: object }} featuresById features per dataset id (missing ids are skipped)
 */
export function playSymphonyFrame(featuresById) {
  if (!started || !symphony) return;
  const t = Tone.now() + lookAhead();
  for (const [id, part] of Object.entries(symphony)) {
    const features = featuresById[id];
    if (!features) continue;
    const c = tuned(part.cfg);
    const mapper = MAPPERS[c.sound.mapper] ?? continuousField;
    mapper(features, c, part.voice, t);
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
 * Needs loadDataset(cfg) first (it does nothing while Planet Symphony is loaded).
 * Example shapes:
 *   { "values": [30] }                                 notes for these data values
 *   { "values": [15], "sweep": true }                  a note with the filter sweeping open
 *   { "flashes": [{ "x": 0, "y": 8, "value": 1 }] }    drum hits (lightning)
 *   { "layer": "dust" }                                that aerosol layer on its own
 */
export function playLegendSample(cfg, i) {
  if (!started || !voice) return;
  const c = tuned(cfg);
  const ex = c.sound.legendExamples?.[i];
  if (!ex) return;

  const L = TUNING.legend;
  const t = Tone.now() + lookAhead();
  const [min, max] = valueRange(c);
  const [lo, hi] = c.sound.octaves ?? [3, 5];
  const scale = c.sound.scale;

  if (ex.flashes) {
    events({ flashes: ex.flashes }, c, voice, t);
  } else if (ex.layer) {
    const inst = voice.layers[ex.layer];
    const gain = voice.layerGains[ex.layer];
    if (!inst || !gain) return;
    const notes = scaleNotes(lo, hi, scale);
    const midi = notes[Math.floor(notes.length / 2)] + (inst.octaveUp ? 12 : 0);
    gain.volume.cancelScheduledValues(t);
    gain.volume.setValueAtTime(L.layerLevel, t);
    gain.volume.setValueAtTime(SILENT_DB, t + L.layerLength + 1);
    inst.triggerAttackRelease(midiToNote(midi), L.layerLength, t, L.layerVelocity);
  } else if (ex.values && voice.inst) {
    if (ex.sweep) {
      const [fMin, fMax] = c.sound.filter ?? [500, 5000];
      voice.filter.frequency.cancelScheduledValues(t);
      voice.filter.frequency.setValueAtTime(fMin, t);
      voice.filter.frequency.exponentialRampToValueAtTime(fMax, t + L.sweepTime);
    }
    ex.values.forEach((v, k) => {
      const midi = valueToMidi(v, min, max, lo, hi, scale);
      if (midi !== null) {
        voice.inst.triggerAttackRelease(midiToNote(midi), ex.sweep ? L.sweepNoteLength : L.noteLength, t + k * L.noteGap, L.velocity);
      }
    });
  }
}

// ---------- Explore mode ----------

/** Note name a data value maps to for this dataset (same scale and octaves as playback). */
export function noteForValue(cfg, value) {
  const c = tuned(cfg);
  const [min, max] = valueRange(c);
  const [lo, hi] = c.sound.octaves ?? [3, 5];
  const midi = valueToMidi(value, min, max, lo, hi, c.sound.scale);
  return midi === null ? null : midiToNote(midi);
}

/**
 * Play one short note for a single explored spot.
 * @param {object} cfg dataset config
 * @param {number} value data value at that spot
 * @param {number} [col] grid column, for left/right position (0 = west edge)
 * @returns {string|null} the note played, e.g. "E5"
 */
export function playProbe(cfg, value, col) {
  if (!started || !voice) return null;
  const note = noteForValue(cfg, value);
  if (!note) return null;
  const X = TUNING.explore;
  const t = Tone.now() + lookAhead();
  const gw = cfg.grid?.w ?? 32;
  if (col !== undefined && gw > 1) voice.panner.pan.setValueAtTime(-1 + (2 * col) / (gw - 1), t);

  let inst = voice.inst;
  if (!inst) {
    // Aerosols: play through the first held (non-bell) layer and make it audible for a moment.
    const names = Object.keys(voice.layers);
    const name = names.find((n) => !voice.layers[n].percussive) ?? names[0];
    if (!name) return null;
    inst = voice.layers[name];
    const gain = voice.layerGains[name];
    if (gain.volume.value < X.layerLevel) {
      gain.volume.setValueAtTime(X.layerLevel, t);
      gain.volume.setValueAtTime(SILENT_DB, t + X.noteLength + 1.5);
    }
  }
  const st = voice.state;
  const at = inst.percussive ? Math.max(t, (st.lastHit ?? 0) + 0.03) : t; // drums: start times must increase
  if (inst.percussive) st.lastHit = at;
  inst.triggerAttackRelease(note, X.noteLength, at, X.velocity);
  return note;
}

// ---------- shared ----------

/** Stop all sounding notes (pause, seek, dataset switch, Esc). */
export function releaseAll() {
  releaseVoice(voice);
  if (symphony) Object.values(symphony).forEach((p) => releaseVoice(p.voice));
}

/** Listener volume in decibels, from the volume slider (0 = full, default -8). */
export function setVolume(db) {
  listenerDb = db;
  if (listener) listener.volume.rampTo(db, 0.05);
}

// ---------- guide chirp ----------

let chirpSynth = null;

/**
 * A short, original chord chirp for the guide character: a quick rising arpeggio and a little
 * two-note answer, made with Tone.js (no sound file). Plays through the master chain, so it
 * follows the volume slider and the limiter. Returns false if audio hasn't started yet.
 */
export function playChirp() {
  if (!started) return false;
  chirpSynth ??= new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.15 },
    volume: -16,
  }).connect(master);
  const t = Tone.now() + lookAhead();
  ['C5', 'E5', 'G5', 'C6'].forEach((note, i) => chirpSynth.triggerAttackRelease(note, 0.09, t + i * 0.055, 0.7));
  chirpSynth.triggerAttackRelease(['E6', 'G6'], 0.14, t + 0.25, 0.5);
  return true;
}

/** Dip the music a little while speech is playing (true), or bring it back (false). */
export function duckMusic(on) {
  if (!duck) return;
  duck.volume.rampTo(on ? TUNING.master.duckDb : 0, TUNING.master.duckTime);
}

/** Loudness of the final mix right now, in dB (−Infinity when silent). For level checks. */
export function outputLevel() {
  return meter ? meter.getValue() : -Infinity;
}

/**
 * Apply changes made to TUNING while audio is running (used by the sound lab).
 * Rebuilds the current voice or symphony so instrument settings take effect.
 * Stops Scan mode; the caller restarts it if needed.
 */
export function retune() {
  tuningChanged();
  if (!started) return;
  const m = TUNING.master;
  master.volume.rampTo(m.volume, 0.05);
  limiter.threshold.rampTo(m.limiter, 0.05);
  reverb.wet.rampTo(m.reverbWet, 0.05);
  if (reverb.decay !== m.reverbDecay) reverb.decay = m.reverbDecay;
  if (symphonyCfgs) loadSymphony(symphonyCfgs);
  else if (currentCfg) loadDataset(currentCfg);
}
