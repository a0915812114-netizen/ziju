"use client";

import { extractAudio, splitAudioIfNeeded } from "./extract-audio";
import { sortCues, splitForReading } from "./cues";
import { isChineseLang } from "./languages";
import type { AsrLanguage } from "./style";
import type { Cue } from "./types";

export class TranscribeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "TranscribeError";
  }
}

type ProgressFn = (progress: number, message: string) => void;

export async function transcribeMedia(
  opts: {
    file: File;
    language: AsrLanguage;
    glossary: string[];
    durationMs: number;
    signal: AbortSignal;
    onExtract?: ProgressFn;
    onTranscribe?: ProgressFn;
  },
): Promise<Cue[]> {
  const audio = await extractAudio(
    opts.file,
    opts.onExtract ?? (() => undefined),
    opts.durationMs,
  );
  if (opts.signal.aborted) throw new DOMException("已取消", "AbortError");

  const chunks = await splitAudioIfNeeded(
    audio,
    opts.durationMs,
    opts.onExtract ?? (() => undefined),
  );
  if (opts.signal.aborted) throw new DOMException("已取消", "AbortError");

  const all: Cue[] = [];
  let ticket = "";
  let prefix = "";
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!chunk) continue;
    opts.onTranscribe?.(
      (i + 0.15) / chunks.length,
      chunks.length > 1 ? `工讀生聽打中 ${i + 1}/${chunks.length}` : "工讀生聽打中",
    );
    const { cues, ticket: nextTicket } = await postChunk({
      file: chunk.file,
      language: opts.language,
      glossary: opts.glossary,
      prefix,
      chunkIndex: i,
      ticket,
      durationMs: chunk.durationMs || opts.durationMs,
      signal: opts.signal,
    });
    ticket = nextTicket || ticket;
    const shifted = shiftCues(cues, chunk.offsetMs);
    all.push(...shifted);
    prefix = shifted
      .map((cue) => cue.text)
      .join("");
  }
  const merged = splitForReading(stitchCues(all));
  if (merged.length === 0) {
    throw new TranscribeError("EMPTY", "沒聽出字幕。請確認片子有人聲，語言改成繁體中文再試一次。");
  }
  if (!isChineseLang(opts.language)) {
    opts.onTranscribe?.(1, "聽打完成");
    return merged;
  }
  opts.onTranscribe?.(0.92, "工讀生在對稿");
  const polished = await polishCueTexts(merged, opts.glossary, opts.signal);
  opts.onTranscribe?.(1, "聽打完成");
  return polished;
}

async function postChunk(opts: {
  file: File;
  language: AsrLanguage;
  glossary: string[];
  prefix: string;
  chunkIndex: number;
  ticket: string;
  durationMs: number;
  signal: AbortSignal;
}) {
  const body = new FormData();
  body.set("audio", opts.file);
  body.set("glossary", opts.glossary.join("\n"));
  body.set("language", opts.language);
  body.set("chunkIndex", String(opts.chunkIndex));
  body.set("durationMs", String(Math.max(0, Math.round(opts.durationMs))));
  if (opts.prefix) body.set("prefix", opts.prefix.slice(-400));
  if (opts.ticket) body.set("ticket", opts.ticket);
  const response = await fetch("/api/transcribe", {
    method: "POST",
    body,
    signal: opts.signal,
  });
  const payload = await readJson(response);
  if (!response.ok || !Array.isArray(payload.cues) || payload.cues.length === 0) {
    throw new TranscribeError(
      payload.error ?? (payload.cues?.length === 0 ? "EMPTY" : "ASR_FAILED"),
      payload.message ?? "聽打失敗",
    );
  }
  return { cues: payload.cues, ticket: payload.ticket ?? "" };
}

function shiftCues(cues: Cue[], offsetMs: number) {
  return cues.map((cue) => ({
    ...cue,
    startMs: cue.startMs + offsetMs,
    endMs: cue.endMs + offsetMs,
    words: cue.words.map((word) => ({
      ...word,
      startMs: word.startMs + offsetMs,
      endMs: word.endMs + offsetMs,
    })),
  }));
}

function stitchCues(cues: Cue[]) {
  const out: Cue[] = [];
  for (const cue of sortCues(cues)) {
    const text = cue.text.trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && isDuplicateCue(prev, cue)) continue;
    if (prev && cue.startMs < prev.endMs) {
      const startMs = prev.endMs;
      if (cue.endMs - startMs < 80) continue;
      out.push({ ...cue, startMs, text });
      continue;
    }
    out.push({ ...cue, text });
  }
  return out;
}

function isDuplicateCue(left: Cue, right: Cue) {
  const a = left.text.replace(/\s/g, "");
  const b = right.text.replace(/\s/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  if (!a.includes(b) && !b.includes(a)) return false;
  const overlap = Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs);
  return overlap > 200;
}

async function polishCueTexts(cues: Cue[], glossary: string[], signal: AbortSignal) {
  try {
    const response = await fetch("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: cues.map((cue) => cue.text),
        glossary,
      }),
      signal,
    });
    const payload = (await response.json()) as { lines?: string[] };
    if (!response.ok || !Array.isArray(payload.lines) || payload.lines.length !== cues.length) {
      return cues;
    }
    return cues.map((cue, index) => {
      const text = String(payload.lines?.[index] ?? "").trim();
      return text ? { ...cue, text } : cue;
    });
  } catch {
    return cues;
  }
}

export async function readJson(response: Response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as {
      cues?: Cue[];
      message?: string;
      error?: string;
      ticket?: string;
    };
  } catch {
    if (response.status === 413 || /request entity too large/i.test(raw)) {
      throw new Error("音訊還是太大，平台吃不下。請改用較小的片子再試。");
    }
    throw new Error(raw.trim().slice(0, 80) || `聽打失敗（${response.status}）`);
  }
}
