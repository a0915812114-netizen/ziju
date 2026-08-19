import { formatSrtTime, formatVttTime } from "./time";
import type { Cue, Word } from "./types";

export function newId() {
  return crypto.randomUUID();
}

function interpolateTime(cue: Cue, charIndex: number) {
  const len = Math.max(cue.text.length, 1);
  const ratio = Math.min(1, Math.max(0, charIndex / len));
  return Math.round(cue.startMs + (cue.endMs - cue.startMs) * ratio);
}

export function sortCues(cues: Cue[]) {
  return [...cues].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function createCue(startMs: number, endMs: number, text = ""): Cue {
  return {
    id: newId(),
    startMs: Math.min(startMs, endMs),
    endMs: Math.max(startMs + 80, endMs),
    text,
    words: [],
  };
}

export function splitCueAtTime(cue: Cue, timeMs: number): [Cue, Cue] | null {
  if (timeMs <= cue.startMs + 80 || timeMs >= cue.endMs - 80) return null;
  if (!cue.text.trim()) {
    return [
      { ...cue, endMs: timeMs, words: cue.words.filter((word) => word.endMs <= timeMs) },
      {
        ...createCue(timeMs, cue.endMs, ""),
        words: cue.words.filter((word) => word.startMs >= timeMs),
      },
    ];
  }
  const span = Math.max(cue.endMs - cue.startMs, 1);
  const charIndex = Math.round(((timeMs - cue.startMs) / span) * cue.text.length);
  const parts = splitCue(cue, Math.min(Math.max(charIndex, 1), cue.text.length - 1));
  if (!parts) {
    const ratio = (timeMs - cue.startMs) / span;
    const cut = Math.max(1, Math.min(cue.text.length - 1, Math.round(cue.text.length * ratio)));
    const forced = splitCue(cue, cut);
    if (!forced) return null;
    forced[0].endMs = timeMs;
    forced[1].startMs = timeMs;
    return forced;
  }
  parts[0].endMs = timeMs;
  parts[1].startMs = timeMs;
  return parts;
}

export function splitCue(cue: Cue, charIndex: number): [Cue, Cue] | null {
  const index = Math.min(Math.max(charIndex, 0), cue.text.length);
  const leftText = cue.text.slice(0, index).trim();
  const rightText = cue.text.slice(index).trim();
  if (!leftText || !rightText) return null;

  const mid = interpolateTime(cue, index);
  const leftWords = cue.words.filter((word) => word.endMs <= mid);
  const rightWords = cue.words.filter((word) => word.startMs >= mid);
  const overlapping = cue.words.filter(
    (word) => word.startMs < mid && word.endMs > mid,
  );

  const left: Cue = {
    id: cue.id,
    startMs: cue.startMs,
    endMs: Math.max(cue.startMs + 80, mid),
    text: leftText,
    words: [...leftWords, ...splitOverlapping(overlapping, mid, "left")],
  };
  const right: Cue = {
    id: newId(),
    startMs: mid,
    endMs: cue.endMs,
    text: rightText,
    words: [...splitOverlapping(overlapping, mid, "right"), ...rightWords],
  };
  return [left, right];
}

function splitOverlapping(
  words: Word[],
  mid: number,
  side: "left" | "right",
): Word[] {
  return words.map((word) =>
    side === "left"
      ? { ...word, endMs: mid }
      : { ...word, startMs: mid },
  );
}

export function mergeCues(left: Cue, right: Cue): Cue {
  const joiner = needsSpace(left.text, right.text) ? " " : "";
  return {
    id: left.id,
    startMs: left.startMs,
    endMs: right.endMs,
    text: `${left.text}${joiner}${right.text}`,
    words: [...left.words, ...right.words],
  };
}

function needsSpace(left: string, right: string) {
  const leftEnd = left.slice(-1);
  const rightStart = right.slice(0, 1);
  return isLatin(leftEnd) && isLatin(rightStart);
}

function isLatin(char: string) {
  return /[A-Za-z0-9]/.test(char);
}

export function replaceInCues(cues: Cue[], find: string, replaceWith: string) {
  if (!find) return { cues, count: 0 };
  let count = 0;
  const next = cues.map((cue) => {
    if (!cue.text.includes(find)) return cue;
    const pieces = cue.text.split(find);
    count += pieces.length - 1;
    return {
      ...cue,
      text: pieces.join(replaceWith),
      words: cue.words.map((word) =>
        word.text === find ? { ...word, text: replaceWith } : word,
      ),
    };
  });
  return { cues: next, count };
}

export function currentCueIndex(cues: Cue[], timeMs: number) {
  return cues.findIndex(
    (cue) => timeMs >= cue.startMs && timeMs < cue.endMs,
  );
}

export function toSrt(cues: Cue[]) {
  return cues
    .filter((cue) => cue.text.trim())
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text.trim()}\n`,
    )
    .join("\n");
}

export function toVtt(cues: Cue[]) {
  const body = cues
    .filter((cue) => cue.text.trim())
    .map(
      (cue) =>
        `${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}\n${cue.text.trim()}`,
    )
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

export function charCount(text: string) {
  return [...text.replace(/\s/g, "")].length;
}

export function charsPerSecond(cue: Cue) {
  const sec = Math.max((cue.endMs - cue.startMs) / 1000, 0.01);
  return charCount(cue.text) / sec;
}

export function parseSrtStamp(value: string) {
  const clean = value.trim().replace(",", ".");
  const parts = clean.split(":");
  if (parts.length < 2) return 0;
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const minutes = Number(parts[parts.length === 3 ? 1 : 0]);
  const rest = parts[parts.length === 3 ? 2 : 1] ?? "0";
  const [sec, frac = "0"] = rest.split(".");
  const millis = Number((frac + "000").slice(0, 3));
  return ((hours * 3600 + minutes * 60 + Number(sec)) * 1000 + millis) | 0;
}

export function parseSrt(raw: string): Cue[] {
  const blocks = raw.replace(/\r/g, "").trim().split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timeLine = lines.find((line) => line.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->");
    const text = lines
      .filter((line) => line !== timeLine && !/^\d+$/.test(line))
      .join("");
    cues.push(createCue(parseSrtStamp(startRaw ?? "0"), parseSrtStamp(endRaw ?? "0"), text));
  }
  return sortCues(cues);
}

export function toTranscript(cues: Cue[]) {
  return cues
    .map((cue) => cue.text.trim())
    .filter(Boolean)
    .join("\n");
}

const MAX_CHARS = 16;

export function splitForReading(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const cue of cues) {
    out.push(...breakLongCue(cue));
  }
  return out;
}

function breakLongCue(cue: Cue): Cue[] {
  const text = cue.text.trim();
  if (text.length <= MAX_CHARS) return [{ ...cue, text }];

  const punct = /[，。！？、；：,!?]/;
  const chunks: string[] = [];
  let buf = "";
  for (const char of text) {
    buf += char;
    if (punct.test(char) || buf.length >= MAX_CHARS) {
      chunks.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  const total = Math.max(text.length, 1);
  let consumed = 0;
  return chunks.map((chunk) => {
    const startRatio = consumed / total;
    consumed += chunk.length;
    const endRatio = consumed / total;
    const startMs = Math.round(
      cue.startMs + (cue.endMs - cue.startMs) * startRatio,
    );
    const endMs = Math.round(
      cue.startMs + (cue.endMs - cue.startMs) * endRatio,
    );
    return {
      id: newId(),
      startMs,
      endMs: Math.max(startMs + 80, endMs),
      text: chunk.replace(/[，。]$/, ""),
      words: cue.words.filter(
        (word) => word.startMs >= startMs && word.startMs < endMs,
      ),
    };
  });
}
