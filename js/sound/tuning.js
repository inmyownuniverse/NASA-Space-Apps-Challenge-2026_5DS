// Owner: Freia · Support: Jaden
// Sound tuning: every number that changes how Earth Jukebox sounds lives in this file.
//
// How to tune:
//   1. Open tools/sound-lab.html, change values there and listen.
//   2. Press "Copy current settings" and paste the changed values back into this file.
//
// Units: dB = decibels (0 = unchanged, -6 = about half as loud), s = seconds,
//        Hz = frequency, velocity = how hard a note is played (0 to 1).
//        Note lengths like '8n' are music lengths: '4n' quarter note, '8n' eighth, '16n' sixteenth.
//
// Which settings a dataset gets: TUNING.defaults, then its datasets/*.json "sound" block,
// then TUNING.datasets[its id]. So a brand new dataset works from its JSON alone, and the four
// datasets below are tuned here.

export const TUNING = {
  // ---------- whole app ----------
  master: {
    volume: 12,        // loudness of the whole mix, on top of the listener's volume slider, dB
    reverbDecay: 4,    // how long the room echo rings, s
    reverbWet: 0.25,   // how much room echo is mixed in, 0 (dry) to 1 (all echo)
    limiter: -3,       // ceiling the final mix can never go above, dB (stops clipping)
    lookAhead: 0.05,   // how far ahead notes are scheduled so they start cleanly, s
    voiceCap: 8,       // most notes one dataset may hold at once, whatever maxVoices says
    duckDb: -6,        // how much the music dips while a spoken summary plays, dB
    duckTime: 0.15,    // how fast the music dips and comes back, s
  },

  scan: {
    bpm: 90,             // Scan mode speed, beats per minute
    step: '16n',         // time between columns (one sixteenth note)
    noteLength: '8n',    // how long each column's chord rings
    velocity: 0.5,       // how hard each column's chord is played
    drumVelocity: 0.6,   // how hard drums and bells are hit in Scan mode
    layerLevel: 0,       // aerosol layer volume used while scanning, dB
  },

  legend: {
    noteLength: 0.8,       // how long each example note rings, s
    noteGap: 0.15,         // time between example notes, s
    velocity: 0.5,         // how hard example notes are played
    sweepNoteLength: 1.8,  // how long the "sweeping tone" example rings, s
    sweepTime: 1.5,        // how long the filter takes to open in that example, s
    layerLevel: -6,        // volume of an aerosol layer played on its own, dB
    layerLength: 1.5,      // how long a solo aerosol layer plays, s
    layerVelocity: 0.6,    // how hard a solo aerosol layer is played
  },

  explore: {
    noteLength: 0.35,  // how long the note for one explored spot rings, s
    velocity: 0.5,     // how hard that note is played
    layerLevel: -6,    // aerosol layer volume used for explored notes, dB
  },

  // Fallback for datasets that are not listed under "datasets" below.
  defaults: {
    octaves: [3, 5],        // lowest and highest octave notes can use
    maxVoices: 6,           // most notes at once (never more than master.voiceCap)
    smoothFrames: 3,        // frames averaged together so notes don't jump around
    level: 0,               // loudness of this dataset in Play, Scan and Legend, dB
    symphonyLevel: -6,      // extra level in Planet Symphony, on top of level, dB
    filter: [500, 5000],    // darkest and brightest tone of the filter, Hz
    filterGlide: 0.3,       // how fast the filter follows changes, s
    changeBoost: 4,         // how strongly "change" opens the filter (change is usually small)
    chordChangeGap: 0.5,    // shortest time between chord changes, s
    voices: {},             // instrument settings, by instrument name
  },

  datasets: {
    // ---------- sea surface temperature: held pad chord ----------
    sst: {
      octaves: [3, 5],        // lowest and highest octave of the pad
      maxVoices: 5,           // most notes in the chord
      smoothFrames: 4,        // frames averaged so the chord moves slowly like the ocean
      level: 7,               // loudness in Play, Scan and Legend, dB
      symphonyLevel: -6,      // extra level in Planet Symphony, on top of level, dB
      filter: [600, 4500],    // darkest tone (calm water) and brightest tone (fast currents), Hz
      filterGlide: 0.3,       // how fast the tone brightens or darkens, s
      changeBoost: 4,         // how strongly current changes brighten the tone
      chordChangeGap: 0.5,    // shortest time between chord changes, s
      tensionAbove: 28,       // water warmer than this (°C) adds a tense note one semitone up
      rootVelocity: 0.35,     // loudness of the main note (from average temperature)
      extraVelocity: 0.2,     // loudness of the other chord notes
      tensionVelocity: 0.12,  // loudness of the tense note
      voices: {
        warmPad: {
          volume: -6,              // loudness of the pad instrument, dB
          attack: 0.9,             // how long the pad takes to fade in, s
          decay: 0.6,              // how long it takes to settle after fading in, s
          sustain: 0.7,            // how loud it stays while held, 0 to 1
          release: 2.2,            // how long it takes to fade out, s
          harmonicity: 1.5,        // pitch ratio of the wobble tone; changes the colour
          oscillator: 'triangle',  // base wave: sine (pure), triangle (soft), sawtooth (buzzy)
          modAttack: 1.2,          // how long the inner wobble takes to fade in, s
          modRelease: 2,           // how long the inner wobble takes to fade out, s
          chorusRate: 0.6,         // speed of the chorus shimmer, Hz
          chorusDepth: 0.5,        // strength of the chorus shimmer, 0 to 1
          chorusMix: 0.35,         // how much chorus is mixed in, 0 to 1
          polyphony: 24,           // notes the synth can ring at once, counting fading ones
        },
      },
    },

    // ---------- lightning: drum hits ----------
    lightning: {
      octaves: [2, 4],        // lowest and highest drum pitch (north flashes are higher)
      maxVoices: 4,           // most drum hits per frame, brightest flashes first
      smoothFrames: 1,        // no smoothing: every flash is its own event
      level: -8,              // loudness in Play, Scan and Legend, dB
      symphonyLevel: -4,      // extra level in Planet Symphony, on top of level, dB
      hitSpacing: 0.06,       // time between hits in the same frame, s
      hitLength: '16n',       // how long each hit is held
      softestHit: 0.3,        // hit strength for the dimmest flash (brightest is 1)
      voices: {
        drum: {
          volume: -8,          // loudness of the drum body, dB
          pitchDecay: 0.06,    // how fast the thump drops in pitch, s
          octaves: 5,          // how far the thump drops in pitch, octaves
          decay: 0.5,          // how long the thump rings, s
          release: 0.8,        // fade after the thump, s
          clickVolume: -18,    // loudness of the noise crack on top, dB
          clickDecay: 0.03,    // how long the crack lasts, s
          clickTone: 3000,     // crack brightness: only sound above this is kept, Hz
        },
      },
    },

    // ---------- night lights: sparkling glass notes ----------
    nightlights: {
      octaves: [4, 6],        // lowest and highest octave of the sparkles
      maxVoices: 6,           // most notes in one burst
      smoothFrames: 2,        // frames averaged together
      level: 7,               // loudness in Play, Scan and Legend, dB
      symphonyLevel: -8,      // extra level in Planet Symphony, on top of level, dB
      litAbove: 5,            // brightness above which a grid cell counts as lit (nW/cm²/sr)
      burstGap: 0.5,          // time between bursts of notes, s
      notesPerLitShare: 2,    // more means more notes for the same lit area
      noteLength: '8n',       // how long each sparkle is held
      softestNote: 0.15,      // note strength for the dimmest lit cell
      loudestNote: 0.6,       // note strength for the brightest lit cell
      sparkleVelocity: 0.25,  // strength of the extra high note when the lit area grows
      sparkleGrowth: 0.01,    // how much the lit share must grow to add that note (0.01 = 1%)
      voices: {
        glass: {
          volume: -10,           // loudness of the glass instrument, dB
          attack: 0.003,         // how fast each note starts, s
          decay: 0.35,           // how long each note rings, s
          release: 0.8,          // fade at the end of each note, s
          harmonicity: 3.01,     // pitch ratio of the bell tone; changes the colour
          modulationIndex: 12,   // how bright and glassy the tone is
          modDecay: 0.2,         // how fast the glassy shine fades, s
          echoTime: '8n',        // time between echoes
          echoFeedback: 0.25,    // how many echoes, 0 (one) to 0.9 (lots)
          echoMix: 0.2,          // how much echo is mixed in, 0 to 1
          polyphony: 32,         // notes the synth can ring at once, counting fading ones
        },
      },
    },

    // ---------- aerosols: four layers on one shared chord ----------
    aerosols: {
      octaves: [2, 5],            // range the shared chord is built from
      maxVoices: 4,               // one note per layer
      smoothFrames: 4,            // frames averaged so the chord moves slowly
      level: 9,                   // loudness in Play, Scan and Legend, dB
      symphonyLevel: -8,          // extra level in Planet Symphony, on top of level, dB
      filter: [800, 6000],        // darkest and brightest tone of the whole mix, Hz
      filterGlide: 0.3,           // how fast the tone follows changes, s
      changeBoost: 4,             // how strongly change opens the filter
      chordChangeGap: 0.5,        // shortest time between note changes per layer, s
      tensionAbove: 0.8,          // a layer stronger than this (0 to 1) adds a tense note
      chordShift: 2,              // how many scale steps the chord rises with the total amount
      quietestLayer: -18,         // volume of a layer that is barely there, dB
      loudestLayer: -6,           // volume of a layer at full strength, dB
      silentBelow: 0.02,          // layers weaker than this (0 to 1) are silent
      layerFade: 0.5,             // how fast a layer's volume follows the data, s
      placeholderStrength: 0.3,   // strength used for every layer until the analyser measures layers
      layerVelocity: 0.4,         // how hard held layer notes are played
      tensionVelocity: 0.12,      // loudness of the tense note
      bellGap: 1.2,               // time between sulfate bell strikes, s
      bellSoftest: 0.3,           // bell strength for a faint layer
      bellLoudest: 0.8,           // bell strength for a full layer
      voices: {
        dust: {
          volume: -10,            // loudness of the dust drone, dB
          attack: 1.0,            // fade in, s
          release: 2.5,           // fade out, s
          harmonicity: 1.001,     // pitch ratio of the inner tone; just above 1 gives a slow beat
          modulationIndex: 4,     // how rough the drone is
          oscillator: 'sawtooth', // base wave
          tone: 700,              // brightness: sound above this is cut, Hz
          polyphony: 6,           // notes it can ring at once
        },
        smoke: {
          volume: 0,              // loudness of the noise, dB
          attack: 0.8,            // fade in, s
          release: 2,             // fade out, s
          crackleRate: 11,        // crackles per second
          crackleDepth: 0.15,     // loudness between crackles, 0 (silent gaps) to 1 (no gaps)
          bandWidth: 1.5,         // how narrow the noise band is (higher = more whistly)
          bandRatio: 4,           // noise band sits at the note's pitch times this
          noise: 'brown',         // noise colour: brown (deep), pink (middle), white (hissy)
        },
        salt: {
          volume: -12,            // loudness of the shimmer, dB
          attack: 0.6,            // fade in, s
          release: 2,             // fade out, s
          chorusRate: 1.2,        // speed of the shimmer, Hz
          chorusDepth: 0.7,       // strength of the shimmer, 0 to 1
          chorusMix: 0.5,         // how much shimmer is mixed in, 0 to 1
          octaveUp: true,         // play one octave above the chord note
          polyphony: 6,           // notes it can ring at once
        },
        sulfate: {
          volume: -22,            // loudness of the bells, dB
          harmonicity: 5.1,       // pitch ratio inside the bell; changes the colour
          modulationIndex: 16,    // how metallic the bell is
          resonance: 3000,        // bell brightness, Hz
          bellOctaves: 1.2,       // spread of the bell's ring, octaves
          decay: 1.2,             // how long each bell rings, s
          release: 0.6,           // fade at the end, s
        },
      },
    },
  },
};

const cache = new WeakMap();
let version = 0;

/** Call after changing TUNING so the next frame picks up the new values. */
export function tuningChanged() { version++; }

/**
 * Settings for one dataset: defaults, then cfg.sound, then TUNING.datasets[cfg.id].
 * Returns a copy of cfg whose `sound` holds the merged settings. Cached until tuningChanged().
 */
export function tuned(cfg) {
  const hit = cache.get(cfg);
  if (hit && hit.version === version) return hit.cfg;
  const own = TUNING.datasets[cfg.id] ?? {};
  const sound = { ...TUNING.defaults, ...cfg.sound, ...own };
  sound.voices = { ...TUNING.defaults.voices, ...cfg.sound?.voices, ...own.voices };
  const out = { ...cfg, sound };
  cache.set(cfg, { version, cfg: out });
  return out;
}

/** Settings for one instrument: the dataset's own, else the first dataset that uses that instrument. */
export function voiceSettings(name, sound) {
  if (sound?.voices?.[name]) return sound.voices[name];
  for (const ds of Object.values(TUNING.datasets)) if (ds.voices?.[name]) return ds.voices[name];
  return {};
}
