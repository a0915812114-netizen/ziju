export const MAX_MEDIA_MS = 40 * 60 * 1000 + 20_000;
export const MAX_MEDIA_BYTES = 800 * 1024 * 1024;
export const MAX_CHUNK_MS = 3.5 * 60 * 1000;
export const MAX_MEDIA_MB = Math.round(MAX_MEDIA_BYTES / (1024 * 1024));

const ALLOWED_EXT = new Set(["mp4", "mov", "m4v", "webm", "m4a", "mp3", "wav", "aac", "ogg"]);

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/aac",
  "audio/x-m4a",
  "audio/mp4a-latm",
  "audio/ogg",
  "video/ogg",
  "audio/x-aac",
]);

export const MEDIA_ACCEPT = [
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".m4a",
  ".mp3",
  ".wav",
  ".aac",
  ".ogg",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
  "audio/ogg",
].join(",");

export function mediaExtension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = match?.[1] ?? "";
  return ALLOWED_EXT.has(ext) ? ext : "";
}

export function ffmpegInputName(name: string) {
  const ext = mediaExtension(name);
  return ext ? `input.${ext}` : "input.mp4";
}

export function randomWavName() {
  const id = globalThis.crypto?.randomUUID?.() ?? `a${Date.now().toString(36)}`;
  return `${id}.wav`;
}

export async function inspectMediaFile(file: File) {
  const ext = mediaExtension(file.name);
  if (!ext) {
    return fail("只接受 mp4、mov、m4v、webm、m4a、mp3、wav、aac、ogg。");
  }
  if (file.size <= 200) {
    return fail("檔案是空的，或還不是音訊／影片。");
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return fail(`檔案超過 ${MAX_MEDIA_MB}MB，請先壓小再製作。`);
  }
  const mime = (file.type || "").toLowerCase();
  if (mime && !ALLOWED_MIME.has(mime) && !mime.startsWith("video/") && !mime.startsWith("audio/")) {
    return fail("這個檔的類型不對。請改存成 mp4 或 m4a。");
  }
  if (mime && isBlockedMime(mime)) {
    return fail("這個檔的類型不對。請改存成 mp4 或 m4a。");
  }
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!magicMatches(head, ext)) {
    return fail("這個檔看起來不是音訊或影片。請改存成 mp4 或 m4a。");
  }
  return { ok: true as const };
}

export function inspectWavUpload(bytes: Uint8Array, size: number, maxBytes: number) {
  if (size > maxBytes || bytes.byteLength > maxBytes) {
    return fail("這一段音訊超過上限。長片會自動分段，若仍失敗請先轉成較小的 mp4。");
  }
  if (bytes.byteLength < 1000) {
    return fail("請上傳音訊");
  }
  const wav = inspectPcmWav(bytes);
  if (!wav.ok) {
    return fail("只接受抽出後的 WAV 音訊。");
  }
  if (wav.durationMs > MAX_CHUNK_MS) {
    return fail("這一段音訊太長。請從工作室重新開始製作。");
  }
  return { ok: true as const, durationMs: wav.durationMs };
}

export function inspectPcmWav(bytes: Uint8Array) {
  if (bytes.length < 44) return { ok: false as const };
  if (!tag(bytes, 0, "RIFF") || !tag(bytes, 8, "WAVE") || !tag(bytes, 12, "fmt ") || !tag(bytes, 36, "data")) {
    return { ok: false as const };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const rate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  if (format !== 1 || channels !== 1 || bits !== 16) return { ok: false as const };
  if (rate < 8000 || rate > 48000) return { ok: false as const };
  const durationMs = Math.max(0, Math.round(((bytes.length - 44) / (rate * 2)) * 1000));
  return { ok: true as const, durationMs, sampleRate: rate };
}

function fail(message: string) {
  return { ok: false as const, message };
}

function isBlockedMime(mime: string) {
  return /javascript|html|php|msdownload|dosexec|x-msdos|x-executable|x-sh/.test(mime);
}

function magicMatches(bytes: Uint8Array, ext: string) {
  if (ext === "wav") return tag(bytes, 0, "RIFF") && tag(bytes, 8, "WAVE");
  if (ext === "ogg") return tag(bytes, 0, "OggS");
  if (ext === "webm") {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (ext === "mp3") return isMp3Head(bytes);
  if (ext === "aac") return isAacHead(bytes);
  if (ext === "mp4" || ext === "mov" || ext === "m4v" || ext === "m4a") {
    return tag(bytes, 4, "ftyp");
  }
  return false;
}

function isMp3Head(bytes: Uint8Array) {
  if (tag(bytes, 0, "ID3")) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function isAacHead(bytes: Uint8Array) {
  if (tag(bytes, 4, "ftyp")) return true;
  return bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9);
}

function tag(bytes: Uint8Array, start: number, text: string) {
  if (bytes.length < start + text.length) return false;
  return text.split("").every((ch, i) => bytes[start + i] === ch.charCodeAt(0));
}
