"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { encodeFloatWav, encodePcmWav, isRiffWave, WAV_SAMPLE_RATE, wavDurationMs } from "./wav";

export const SAFE_UPLOAD_BYTES = 3.2 * 1024 * 1024;
export const MAX_MEDIA_MS = 40 * 60 * 1000 + 20_000;
const SAMPLE_RATE = WAV_SAMPLE_RATE;
const BYTES_PER_SEC = SAMPLE_RATE * 2;
const WAV_CHUNK_PCM = Math.floor((SAFE_UPLOAD_BYTES - 64) / 2) * 2;
const ASR_WINDOW_PCM = Math.floor((6 * BYTES_PER_SEC) / 2) * 2;
const ASR_OVERLAP_PCM = Math.floor((0.8 * BYTES_PER_SEC) / 2) * 2;
const DECODE_MS = 3 * 60 * 1000;

type ProgressFn = (progress: number, message: string) => void;

export type AudioChunk = {
  file: File;
  offsetMs: number;
  durationMs: number;
};

let ffmpegSingleton: FFmpeg | null = null;

export async function extractAudio(
  file: File,
  onProgress: ProgressFn,
  durationMs = 0,
) {
  if (durationMs > MAX_MEDIA_MS) {
    throw new Error("目前最長 40 分鐘。請先剪短再製作。");
  }

  const shortEnoughToDecode = durationMs === 0 || durationMs <= DECODE_MS;
  if (shortEnoughToDecode) {
    onProgress(0.08, "正在用瀏覽器抽出聲音…");
    const decoded = await tryDecodeToWav(file);
    if (decoded && decoded.blob.size > 1000 && audioCoversVideo(decoded.durationMs, durationMs)) {
      onProgress(1, "音訊已就緒");
      return wavFile(decoded.blob, file.name);
    }
  }

  onProgress(0.1, durationMs > 600_000 ? "長片抽音中，請稍候…" : "載入抽音引擎（第一次會較久）…");
  const fromFfmpeg = await extractWavWithFfmpeg(file, onProgress);
  if (fromFfmpeg) {
    onProgress(1, "音訊已就緒");
    return fromFfmpeg;
  }

  onProgress(0.7, "改用瀏覽器再抽一次聲音…");
  const fallback = await tryDecodeToWav(file);
  if (fallback && fallback.blob.size > 1000 && audioCoversVideo(fallback.durationMs, durationMs)) {
    onProgress(1, "音訊已就緒");
    return wavFile(fallback.blob, file.name);
  }
  throw new Error("抽不出聲音。請改存成 mp4 或 m4a 再試。");
}

export async function splitAudioIfNeeded(
  file: File,
  _durationMs: number,
  onProgress: ProgressFn,
): Promise<AudioChunk[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isWav(bytes)) {
    const pcm = Math.max(0, bytes.length - 44);
    if (pcm > ASR_WINDOW_PCM || file.size > SAFE_UPLOAD_BYTES) {
      onProgress(0.2, "正在切成短段聽打…");
      const chunks = splitWavBytes(bytes, file.name);
      onProgress(1, `分成 ${chunks.length} 段聽打`);
      return chunks;
    }
    return [
      {
        file: ensureNamedAudio(file),
        offsetMs: 0,
        durationMs: wavDurationMs(bytes.length) || _durationMs,
      },
    ];
  }
  if (file.size <= SAFE_UPLOAD_BYTES && file.size > 200) {
    return [{ file: ensureNamedAudio(file), offsetMs: 0, durationMs: _durationMs }];
  }
  throw new Error("音訊仍太大。請先剪短再製作。");
}

function wavFile(blob: Blob, name: string) {
  return new File([blob], `${baseName(name)}.wav`, { type: "audio/wav" });
}

function ensureNamedAudio(file: File) {
  if (file.type === "audio/wav" || file.name.toLowerCase().endsWith(".wav")) {
    return file.type === "audio/wav" ? file : wavFile(file, file.name);
  }
  return file;
}

function isWav(bytes: Uint8Array) {
  return isRiffWave(bytes);
}

function splitWavBytes(bytes: Uint8Array, name: string): AudioChunk[] {
  const pcm = bytes.subarray(44);
  const chunks: AudioChunk[] = [];
  const windowBytes = Math.min(WAV_CHUNK_PCM, ASR_WINDOW_PCM);
  const overlap = ASR_OVERLAP_PCM;
  let offset = 0;
  let index = 0;
  while (offset < pcm.length) {
    const end = Math.min(pcm.length, offset + windowBytes);
    const slice = pcm.subarray(offset, end);
    const wav = encodePcmWav(slice);
    chunks.push({
      file: new File([toArrayBuffer(wav)], `${baseName(name)}-${index + 1}.wav`, {
        type: "audio/wav",
      }),
      offsetMs: Math.round((offset / BYTES_PER_SEC) * 1000),
      durationMs: Math.round((slice.length / BYTES_PER_SEC) * 1000),
    });
    if (end >= pcm.length) break;
    offset = Math.max(offset + windowBytes - overlap, offset + 2);
    index += 1;
  }
  return chunks.length
    ? chunks
    : [
        {
          file: wavFile(new Blob([toArrayBuffer(bytes)], { type: "audio/wav" }), name),
          offsetMs: 0,
          durationMs: wavDurationMs(bytes.length),
        },
      ];
}

function audioCoversVideo(audioMs: number, videoMs: number) {
  if (!videoMs) return true;
  return audioMs >= videoMs * 0.85;
}

async function extractWavWithFfmpeg(file: File, onProgress: ProgressFn) {
  const ffmpeg = await getFfmpeg((ratio) => {
    onProgress(0.12 + ratio * 0.78, "正在抽出聲音…");
  });
  const inputName = `input${extension(file.name)}`;
  const outputName = "audio.wav";
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  try {
    const code = await ffmpeg.exec([
      "-i",
      inputName,
      "-y",
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      outputName,
    ]);
    if (code !== 0) return null;
    const data = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(outputName);
    const bytes = data instanceof Uint8Array ? new Uint8Array(data) : null;
    if (!bytes || !isWav(bytes) || bytes.length < 1000) return null;
    return new File([toArrayBuffer(bytes)], `${baseName(file.name)}.wav`, {
      type: "audio/wav",
    });
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      /* already gone */
    }
  }
}

async function getFfmpeg(onRatio: (ratio: number) => void) {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => onRatio(progress));
  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegSingleton = ffmpeg;
  return ffmpeg;
}

async function tryDecodeToWav(file: File) {
  try {
    const ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const wav = encodeFloatWav(resampleMono(buffer, SAMPLE_RATE), SAMPLE_RATE);
    await ctx.close();
    if (wav.length < 1000) return null;
    return { blob: new Blob([toArrayBuffer(wav)], { type: "audio/wav" }), durationMs: buffer.duration * 1000 };
  } catch {
    return null;
  }
}

function resampleMono(buffer: AudioBuffer, sampleRate: number) {
  const length = Math.max(1, Math.round(buffer.duration * sampleRate));
  const out = new Float32Array(length);
  const ratio = buffer.sampleRate / sampleRate;
  const channels = buffer.numberOfChannels;
  for (let i = 0; i < length; i += 1) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, (buffer.getChannelData(0)?.length ?? 1) - 1);
    const frac = srcIndex - i0;
    let mix = 0;
    for (let ch = 0; ch < channels; ch += 1) {
      const data = buffer.getChannelData(ch);
      const a = data[Math.min(i0, data.length - 1)] ?? 0;
      const b = data[Math.min(i1, data.length - 1)] ?? a;
      mix += a * (1 - frac) + b * frac;
    }
    out[i] = mix / channels;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function extension(name: string) {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx) : ".mp4";
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "audio";
}
