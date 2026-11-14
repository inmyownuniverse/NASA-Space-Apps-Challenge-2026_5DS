// Owner: Freia · Support: Jaden
// Instrument factory. Every instrument is built in code with Tone.js (no sample files to host).
//
// Common interface (what the mappers call):
//   triggerAttackRelease(note, duration, time, velocity)
//   triggerAttack(note, time, velocity) / triggerRelease(note, time)   — sustaining instruments
//   releaseAll(time)                                                     — polyphonic instruments
//   dispose()                                                           — frees effects too
// Flags:
//   inst.percussive = true  → can't hold notes; mappers re-strike it instead (drum, bells)

import * as Tone from 'https://esm.sh/tone@15.1.22';

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

const FACTORIES = {
  // Sea surface temperature: warm AM pad, slow attack, gentle chorus.
  warmPad(dest) {
    const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.5, wet: 0.35 }).start();
    const synth = poly(Tone.AMSynth, {
      harmonicity: 1.5,
      oscillator: { type: 'triangle' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.9, decay: 0.6, sustain: 0.7, release: 2.2 },
      modulationEnvelope: { attack: 1.2, decay: 0.5, sustain: 0.8, release: 2 },
      volume: -12,
    }, 24);
    synth.chain(chorus, dest);
    return owning(synth, [chorus]);
  },

  // Lightning: deep membrane thump + a short noise click for the crack of the strike.
  drum(dest) {
    const out = new Tone.Gain(1).connect(dest);
    const body = new Tone.MembraneSynth({
      pitchDecay: 0.06,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.8 },
      volume: -8,
    }).connect(out);
    const clickFilter = new Tone.Filter({ frequency: 3000, type: 'highpass' }).connect(out);
    const click = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
      volume: -18,
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
  glass(dest) {
    const delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.25, wet: 0.2 });
    const synth = poly(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 12,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.003, decay: 0.35, sustain: 0, release: 0.8 },
      modulationEnvelope: { attack: 0.003, decay: 0.2, sustain: 0, release: 0.3 },
      volume: -18,
    }, 32);
    synth.chain(delay, dest);
    return owning(synth, [delay]);
  },

  // ---- Aerosol layers: four clearly different textures on one shared chord ----

  // Dust: low FM drone (cello-like).
  dust(dest) {
    const filter = new Tone.Filter({ frequency: 700, type: 'lowpass' });
    const synth = poly(Tone.FMSynth, {
      harmonicity: 1.001,
      modulationIndex: 4,
      oscillator: { type: 'sawtooth' },
      modulation: { type: 'sine' },
      envelope: { attack: 1.0, decay: 0.5, sustain: 0.9, release: 2.5 },
      volume: -16,
    }, 6);
    synth.chain(filter, dest);
    return owning(synth, [filter]);
  },

  // Smoke: brown-noise crackle, gated by a fast square LFO; pitch sets the noise band.
  smoke(dest) {
    const env = new Tone.AmplitudeEnvelope({ attack: 0.8, decay: 0.3, sustain: 1, release: 2 }).connect(dest);
    const crackle = new Tone.Gain(0).connect(env);
    const lfo = new Tone.LFO({ frequency: 11, type: 'square', min: 0.15, max: 1 }).connect(crackle.gain).start();
    const band = new Tone.Filter({ frequency: 1200, type: 'bandpass', Q: 1.5 }).connect(crackle);
    const noise = new Tone.Noise({ type: 'brown', volume: -6 }).connect(band).start();
    let held = null;

    return {
      triggerAttack(note, time, vel = 1) {
        held = note;
        band.frequency.setValueAtTime(Tone.Frequency(note).toFrequency() * 4, time);
        env.triggerAttack(time, vel);
      },
      triggerRelease(note, time) { if (note === held) { env.triggerRelease(time); held = null; } },
      triggerAttackRelease(note, dur, time, vel = 1) {
        band.frequency.setValueAtTime(Tone.Frequency(note).toFrequency() * 4, time);
        env.triggerAttackRelease(dur, time, vel);
      },
      releaseAll(time) { env.triggerRelease(time); held = null; },
      dispose() { [noise, band, lfo, crackle, env].forEach((n) => n.dispose()); },
    };
  },

  // Sea salt: airy high sine shimmer with chorus (played an octave up).
  salt(dest) {
    const chorus = new Tone.Chorus({ frequency: 1.2, delayTime: 2.5, depth: 0.7, wet: 0.5 }).start();
    const synth = poly(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.6, decay: 0.3, sustain: 0.8, release: 2 },
      volume: -18,
    }, 6);
    synth.chain(chorus, dest);
    synth.octaveUp = true;
    return owning(synth, [chorus]);
  },

  // Sulfate: soft metallic bells, re-struck while the layer is present.
  sulfate(dest) {
    const bell = new Tone.MetalSynth({
      harmonicity: 5.1,
      modulationIndex: 16,
      resonance: 3000,
      octaves: 1.2,
      envelope: { attack: 0.002, decay: 1.2, release: 0.6 },
      volume: -28,
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
 */
export function makeInstrument(name, destination) {
  const make = FACTORIES[name] ?? FACTORIES.warmPad;
  return make(destination);
}

/** Dispose an instrument made by makeInstrument (effects included). */
export function disposeInstrument(inst) {
  if (!inst) return;
  inst.releaseAll?.();
  inst.dispose();
}

export const INSTRUMENT_NAMES = Object.keys(FACTORIES);
