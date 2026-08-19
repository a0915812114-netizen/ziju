"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const WAV_LIMIT_MS = 12 * 60 * 1000;

type ProgressFn = (progress: number, message: string) => void;

let ffmpegSingleton: FFmpeg | null = null;

export async function extractAudio(file: File, onProgress: ProgressFn) {
  if (file.type.startsWith("audio/") && file.size <= MAX_UPLOAD_BYTES) {
    onProgress(1, "音檔可直接送出");
    return file;
  }

  onProgress(0.05, "正在解碼音訊…");
  const decoded = await tryDecodeToWav(file);
  if (decoded && decoded.durationMs <= WAV_LIMIT_MS && decoded.blob.size <= MAX_UPLOAD_BYTES) {
    onProgress(1, "已抽出音訊");
    return new File([decoded.blob], `${baseName(file.name)}.wav`, {
      type: "audio/wav",
    });
  }

  onProgress(0.1, "載入抽音引擎（第一次會較久）…");
  const ffmpeg = await getFfmpeg((ratio) => {
    onProgress(0.15 + ratio * 0.8, "正在壓縮音訊…");
  });

  const inputName = `input${extension(file.name)}`;
  const outputName = "audio.mp3";
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  const code = await ffmpeg.exec([
    "-i",
    inputName,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    outputName,
  ]);
  if (code !== 0) {
    throw new Error("抽音失敗，請改上傳 mp3 或 wav");
  }
  const data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  const copy = new Uint8Array(bytes);
  onProgress(1, "音訊已就緒");
  return new File([copy], `${baseName(file.name)}.mp3`, { type: "audio/mpeg" });
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
    const wav = encodeWav(resampleMono(buffer, 16000), 16000);
    await ctx.close();
    return { blob: wav, durationMs: buffer.duration * 1000 };
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
    let mix = 0;
    for (let ch = 0; ch < channels; ch += 1) {
      const data = buffer.getChannelData(ch);
      mix += data[Math.min(i0, data.length - 1)] ?? 0;
    }
    out[i] = mix / channels;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function extension(name: string) {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx) : ".mp4";
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "audio";
}
