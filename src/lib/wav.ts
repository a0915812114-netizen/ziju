export const WAV_SAMPLE_RATE = 16000;

export function wavDurationMs(byteLength: number) {
  return Math.max(0, Math.round(((byteLength - 44) / (WAV_SAMPLE_RATE * 2)) * 1000));
}

export function isRiffWave(bytes: Uint8Array) {
  if (bytes.length < 44) return false;
  return (
    tag(bytes, 0, "RIFF") &&
    tag(bytes, 8, "WAVE") &&
    tag(bytes, 12, "fmt ") &&
    tag(bytes, 36, "data")
  );
}

export function encodePcmWav(pcm: Uint8Array, sampleRate = WAV_SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);
  writeHeader(view, pcm.length, sampleRate);
  out.set(pcm, 44);
  return out;
}

export function encodeFloatWav(samples: Float32Array, sampleRate = WAV_SAMPLE_RATE) {
  const pcm = new Uint8Array(samples.length * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return encodePcmWav(pcm, sampleRate);
}

export function repairPcmWav(bytes: Uint8Array) {
  if (!isRiffWave(bytes)) return bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const pcmBytes = Math.max(0, copy.length - 44);
  writeHeader(view, pcmBytes, readSampleRate(view) || WAV_SAMPLE_RATE);
  copy.set(bytes.subarray(44), 44);
  return copy;
}

function readSampleRate(view: DataView) {
  const rate = view.getUint32(24, true);
  return rate === 8000 || rate === 16000 || rate === 22050 || rate === 24000 || rate === 44100 || rate === 48000
    ? rate
    : 0;
}

function writeHeader(view: DataView, pcmBytes: number, sampleRate: number) {
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcmBytes, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, pcmBytes, true);
}

function tag(bytes: Uint8Array, start: number, text: string) {
  return text.split("").every((ch, i) => bytes[start + i] === ch.charCodeAt(0));
}

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
