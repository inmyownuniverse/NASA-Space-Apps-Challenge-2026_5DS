// Owner: Jaden · Support: Freia
// Export the current dataset's music as an audio file people can download and share.
//
// Quick version (done): record everything that comes out of the speakers with Tone.Recorder,
// then download it as a .webm file (Chrome, Firefox) or .mp4 (Safari).

import * as Tone from 'https://esm.sh/tone@15.1.22';

let recorder = null;

export function isRecording() {
  return recorder !== null;
}

/** Start recording the app's sound output. Audio must already be started (initAudio). */
export async function startRecording() {
  if (recorder) return;
  recorder = new Tone.Recorder();
  Tone.getDestination().connect(recorder);
  await recorder.start();
}

/**
 * Stop recording and download the file.
 * @param {string} [name] file name without extension, e.g. "sst-earth-jukebox"
 * @returns {Promise<Blob|null>} the recording
 */
export async function stopRecording(name = 'earth-jukebox') {
  if (!recorder) return null;
  const r = recorder;
  recorder = null;
  const blob = await r.stop();
  Tone.getDestination().disconnect(r);
  r.dispose();
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return blob;
}

/**
 * Record a track for a dataset.
 * TODO(Jaden): WAV version: render offline with Tone.Offline (step through frames, call the mapper
 * for each one), then convert the AudioBuffer to WAV and download it. Faster than real time and
 * gives a lossless file.
 *
 * @param {object} cfg dataset config
 * @returns {Promise<Blob|null>} recorded audio, or null while not implemented
 */
export async function recordTrack(cfg) {
  return null;
}
