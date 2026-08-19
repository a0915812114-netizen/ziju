import { toTaiwanTraditional } from "./taiwan";

const HALLUCINATION =
  /^(謝謝觀看|謝謝收看|請訂閱|歡迎訂閱|字幕by|subtitles by|thanks for watching).*$/i;

export function cleanCueText(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || HALLUCINATION.test(trimmed.replace(/\s/g, ""))) return "";
  return toTaiwanTraditional(trimmed);
}
