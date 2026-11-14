// Owner: Jaden · Support: Freia
// Export the current dataset's music as an audio file people can download and share.

/**
 * Record a track for a dataset.
 * TODO(Jaden):
 *  - Quick version: connect a Tone.Recorder to the master chain, play the video through once,
 *    then recorder.stop() → Blob (webm) → download link.
 *  - WAV version: render offline with Tone.Offline (step through frames, call the mapper for
 *    each one), then convert the AudioBuffer with audiobuffer-to-wav and download it.
 *  - Announce progress and completion through a11y.announce().
 *
 * @param {object} cfg dataset config
 * @returns {Promise<Blob|null>} recorded audio, or null while not implemented
 */
export async function recordTrack(cfg) {
  return null;
}
