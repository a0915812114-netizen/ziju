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
  const leftT = left.translation?.trim() ?? "";
  const rightT = right.translation?.trim() ?? "";
  const tJoin = needsSpace(leftT, rightT) ? " " : "";
  return {
    id: left.id,
    startMs: left.startMs,
    endMs: right.endMs,
    text: `${left.text}${joiner}${right.text}`,
    translation: leftT || rightT ? `${leftT}${tJoin}${rightT}`.trim() : undefined,
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

export function cueHasFind(text: string, find: string) {
  const needle = find.trim();
  if (!needle) return false;
  return fold(text).includes(fold(needle));
}

export function replaceInCues(cues: Cue[], find: string, replaceWith: string) {
  const needle = find.trim();
  if (!needle) return { cues, count: 0 };
  let count = 0;
  const next = cues.map((cue) => {
    const result = replaceInText(cue.text, needle, replaceWith);
    if (result.count === 0) return cue;
    count += result.count;
    return {
      ...cue,
      text: result.text,
      words: cue.words.map((word) => {
        const wordResult = replaceInText(word.text, needle, replaceWith);
        return wordResult.count ? { ...word, text: wordResult.text } : word;
      }),
    };
  });
  return { cues: next, count };
}

export function replaceInCue(cue: Cue, find: string, replaceWith: string) {
  const result = replaceInCues([cue], find, replaceWith);
  return { cue: result.cues[0] ?? cue, count: result.count };
}

function replaceInText(text: string, find: string, replaceWith: string) {
  const needle = fold(find);
  if (!needle) return { text, count: 0 };
  const source = fold(text);
  let count = 0;
  let out = "";
  let cursor = 0;
  let from = 0;
  while (from < text.length) {
    const at = source.indexOf(needle, from);
    if (at < 0) {
      out += text.slice(cursor);
      break;
    }
    out += text.slice(cursor, at) + replaceWith;
    count += 1;
    cursor = at + find.trim().length;
    from = cursor;
  }
  return { text: out, count };
}

function fold(text: string) {
  return text.toLocaleLowerCase("zh-Hant");
}

export function currentCueIndex(cues: Cue[], timeMs: number) {
  return cues.findIndex(
    (cue) => timeMs >= cue.startMs && timeMs < cue.endMs,
  );
}

export function cueAtTime(cues: Cue[], timeMs: number): Cue | undefined {
  if (cues.length === 0) return undefined;
  const exact = cues.find(
    (cue) => timeMs >= cue.startMs && timeMs <= cue.endMs,
  );
  if (exact) return exact;
  let last: Cue | undefined;
  for (const cue of cues) {
    if (cue.startMs <= timeMs) last = cue;
    else break;
  }
  if (!last) {
    const first = cues[0];
    if (first && timeMs + 160 >= first.startMs) return first;
    return undefined;
  }
  const next = cues[cues.findIndex((cue) => cue.id === last.id) + 1];
  if (next) return last;
  return timeMs <= last.endMs + 400 ? last : undefined;
}

export function toSrt(cues: Cue[], bilingual = false) {
  return cues
    .filter((cue) => cue.text.trim())
    .map((cue, index) => {
      const lines = [cue.text.trim()];
      if (bilingual && cue.translation?.trim()) lines.push(cue.translation.trim());
      return `${index + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${lines.join("\n")}\n`;
    })
    .join("\n");
}

export function toVtt(cues: Cue[], bilingual = false) {
  const body = cues
    .filter((cue) => cue.text.trim())
    .map((cue) => {
      const lines = [cue.text.trim()];
      if (bilingual && cue.translation?.trim()) lines.push(cue.translation.trim());
      return `${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}\n${lines.join("\n")}`;
    })
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
