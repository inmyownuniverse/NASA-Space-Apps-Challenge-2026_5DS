// Owner: Jaden · Support: Freia
// Export the current dataset's music as an audio file people can download and share.
//
// Capture the live mix and encode the decoded recording as PCM WAV.

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
  try {
    await recorder.start();
  } catch (error) {
    Tone.getDestination().disconnect(recorder);
    recorder.dispose();
    recorder = null;
    throw error;
  }
}

function encodeWav(audio) {
  const { numberOfChannels: channels, sampleRate, length } = audio;
  const bytes = length * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const tag = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, bytes + 36, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, bytes, true);
  const samples = Array.from({ length: channels }, (_, channel) => audio.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < length; frame++) {
    for (const channel of samples) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      view.setInt16(offset, sample * (sample < 0 ? 32768 : 32767), true);
      offset += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

export async function stopRecording(name = 'terratone') {
  if (!recorder) return null;
  const r = recorder;
  recorder = null;
  let captured;
  try {
    captured = await r.stop();
  } finally {
    Tone.getDestination().disconnect(r);
    r.dispose();
  }
  let blob = captured;
  let ext = captured.type.includes('mp4') ? 'mp4' : 'webm';
  try {
    const audio = await Tone.getContext().rawContext.decodeAudioData(await captured.arrayBuffer());
    blob = encodeWav(audio);
    ext = 'wav';
  } catch {
    // Some browsers cannot decode their own MediaRecorder container.
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name + '.' + ext;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  return blob;
}

export async function recordTrack(cfg) {
  return null;
}
