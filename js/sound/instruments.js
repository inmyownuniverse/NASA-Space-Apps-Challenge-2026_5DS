// Owner: Freia · Support: Jaden
// Instrument factory. Every instrument is built in code with Tone.js (no sample files to host).
// All the numbers (volumes, envelopes, effects) come from tuning.js.
//
// Common interface (what the mappers call):
//   triggerAttackRelease(note, duration, time, velocity)
//   triggerAttack(note, time, velocity) / triggerRelease(note, time)   — sustaining instruments
//   releaseAll(time)                                                     — polyphonic instruments
//   dispose()                                                           — frees effects too
// Flags:
//   inst.percussive = true  → can't hold notes; mappers re-strike it instead (drum, bells)

import * as Tone from 'https://esm.sh/tone@15.1.22';
import { voiceSettings } from './tuning.js';

/** Make inst.dispose() also dispose its extra nodes. */
function owning(inst, extras) {
  const own = inst.dispose.bind(inst);
  inst.dispose = () => { own(); extras.forEach((n) => n.dispose()); return inst; };
  return inst;
}

function poly(voice, options, maxPolyphony = 16) {
  const synth = new Tone.PolySynth(voice, options);
  synth.maxPolyphony = maxPolyphony;
  return synth;
}

// Every factory takes (destination, p) where p is that instrument's settings from tuning.js.
const FACTORIES = {
  // Sea surface temperature: warm AM pad, slow attack, gentle chorus.
  warmPad(dest, p) {
    const chorus = new Tone.Chorus({ frequency: p.chorusRate, delayTime: 3.5, depth: p.chorusDepth, wet: p.chorusMix }).start();
    const synth = poly(Tone.AMSynth, {
      harmonicity: p.harmonicity,
      oscillator: { type: p.oscillator },
      modulation: { type: 'sine' },
      envelope: { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release },
      modulationEnvelope: { attack: p.modAttack, decay: 0.5, sustain: 0.8, release: p.modRelease },
      volume: p.volume,
    }, p.polyphony);
    synth.chain(chorus, dest);
    return owning(synth, [chorus]);
  },

  // Lightning: deep membrane thump + a short noise click for the crack of the strike.
  drum(dest, p) {
    const out = new Tone.Gain(1).connect(dest);
    const body = new Tone.MembraneSynth({
      pitchDecay: p.pitchDecay,
      octaves: p.octaves,
      envelope: { attack: 0.001, decay: p.decay, sustain: 0, release: p.release },
      volume: p.volume,
    }).connect(out);
    const clickFilter = new Tone.Filter({ frequency: p.clickTone, type: 'highpass' }).connect(out);
    const click = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: p.clickDecay, sustain: 0, release: 0.02 },
      volume: p.clickVolume,
    }).connect(clickFilter);

    return {
      percussive: true,
      triggerAttackRelease(note, dur, time, vel = 1) {
        body.triggerAttackRelease(note, dur, time, vel);
        click.triggerAttackRelease('32n', time, vel);
      },
      triggerRelease() {},
      dispose() { [body, click, clickFilter, out].forEach((n) => n.dispose()); },
    };
  },

  // Night lights: FM glass with a short pluck envelope and a little echo.
  glass(dest, p) {
    const delay = new Tone.FeedbackDelay({ delayTime: p.echoTime, feedback: p.echoFeedback, wet: p.echoMix });
    const synth = poly(Tone.FMSynth, {
      harmonicity: p.harmonicity,
      modulationIndex: p.modulationIndex,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: p.attack, decay: p.decay, sustain: 0, release: p.release },
      modulationEnvelope: { attack: p.attack, decay: p.modDecay, sustain: 0, release: 0.3 },
      volume: p.volume,
    }, p.polyphony);
    synth.chain(delay, dest);
    return owning(synth, [delay]);
  },

  // ---- Aerosol layers: four clearly different textures on one shared chord ----

  // Dust: low FM drone (cello-like).
  dust(dest, p) {
    const filter = new Tone.Filter({ frequency: p.tone, type: 'lowpass' });
    const synth = poly(Tone.FMSynth, {
      harmonicity: p.harmonicity,
      modulationIndex: p.modulationIndex,
      oscillator: { type: p.oscillator },
      modulation: { type: 'sine' },
      envelope: { attack: p.attack, decay: 0.5, sustain: 0.9, release: p.release },
      volume: p.volume,
    }, p.polyphony);
    synth.chain(filter, dest);
    return owning(synth, [filter]);
  },

  // Smoke: noise crackle, gated by a fast square LFO; pitch sets the noise band.
  smoke(dest, p) {
    const env = new Tone.AmplitudeEnvelope({ attack: p.attack, decay: 0.3, sustain: 1, release: p.release }).connect(dest);
    const crackle = new Tone.Gain(0).connect(env);
    const lfo = new Tone.LFO({ frequency: p.crackleRate, type: 'square', min: p.crackleDepth, max: 1 }).connect(crackle.gain).start();
    const band = new Tone.Filter({ frequency: 1200, type: 'bandpass', Q: p.bandWidth }).connect(crackle);
    const noise = new Tone.Noise({ type: p.noise, volume: p.volume }).connect(band).start();
    const bandFreq = (note) => Tone.Frequency(note).toFrequency() * p.bandRatio;
    let held = null;

    return {
      triggerAttack(note, time, vel = 1) {
        held = note;
        band.frequency.setValueAtTime(bandFreq(note), time);
        env.triggerAttack(time, vel);
      },
      triggerRelease(note, time) { if (note === held) { env.triggerRelease(time); held = null; } },
      triggerAttackRelease(note, dur, time, vel = 1) {
        band.frequency.setValueAtTime(bandFreq(note), time);
        env.triggerAttackRelease(dur, time, vel);
      },
      releaseAll(time) { env.triggerRelease(time); held = null; },
      dispose() { [noise, band, lfo, crackle, env].forEach((n) => n.dispose()); },
    };
  },

  // Sea salt: airy sine shimmer with chorus (optionally an octave up).
  salt(dest, p) {
    const chorus = new Tone.Chorus({ frequency: p.chorusRate, delayTime: 2.5, depth: p.chorusDepth, wet: p.chorusMix }).start();
    const synth = poly(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: p.attack, decay: 0.3, sustain: 0.8, release: p.release },
      volume: p.volume,
    }, p.polyphony);
    synth.chain(chorus, dest);
    synth.octaveUp = Boolean(p.octaveUp);
    return owning(synth, [chorus]);
  },

  // Sulfate: soft metallic bells, re-struck while the layer is present.
  sulfate(dest, p) {
    const bell = new Tone.MetalSynth({
      harmonicity: p.harmonicity,
      modulationIndex: p.modulationIndex,
      resonance: p.resonance,
      octaves: p.bellOctaves,
      envelope: { attack: 0.002, decay: p.decay, release: p.release },
      volume: p.volume,
    }).connect(dest);
    let last = -1;
    return {
      percussive: true,
      triggerAttackRelease(note, dur, time, vel = 1) {
        const t = Math.max(time, last + 0.01); // monophonic: start times must increase
        last = t;
        bell.triggerAttackRelease(note, dur, t, vel);
      },
      triggerRelease() {},
      dispose() { bell.dispose(); },
    };
  },
};

/**
 * Create an instrument by name, connected to a destination node.
 * Unknown names fall back to warmPad so the app never goes silent.
 * @param {string} name e.g. "warmPad"
 * @param {Tone.ToneAudioNode} destination
 * @param {object} [sound] the dataset's tuned sound settings (instrument settings are in sound.voices)
 */
export function makeInstrument(name, destination, sound) {
  const known = name in FACTORIES ? name : 'warmPad';
  return FACTORIES[known](destination, voiceSettings(known, sound));
}

/** Dispose an instrument made by makeInstrument (effects included). */
export function disposeInstrument(inst) {
  if (!inst) return;
  inst.releaseAll?.();
  inst.dispose();
}

export const INSTRUMENT_NAMES = Object.keys(FACTORIES);
