import { cueAtTime } from "./cues";
import type { Cue } from "./types";
import type { SubtitleStyle } from "./style";

type Glyph = {
  ch: string;
  lit: boolean;
};

export function canvasFontFamily(fontFamily: string) {
  if (typeof document === "undefined") return '"Noto Sans TC", sans-serif';
  const probe = document.createElement("span");
  probe.style.fontFamily = fontFamily;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).fontFamily;
  probe.remove();
  return resolved || '"Noto Sans TC", sans-serif';
}

export function drawSubtitleFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cues: Cue[],
  timeMs: number,
  style: SubtitleStyle,
) {
  const cue = cueAtTime(cues, timeMs);
  if (!cue?.text) return;

  const fontPx = Math.max(16, (style.fontSize / 100) * width);
  ctx.font = `600 ${fontPx}px ${canvasFontFamily(style.fontFamily)}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(1, fontPx * 0.065 * (style.strokeWidth / 0.18));
  ctx.strokeStyle = style.strokeColor;
  ctx.fillStyle = style.color;

  const x = (style.x / 100) * width;
  const y = (style.y / 100) * height;
  const maxWidth = width * 0.86;
  const glyphs = toGlyphs(cue, timeMs, Boolean(style.karaoke && cue.words.length));
  const lines = wrapGlyphs(ctx, glyphs, maxWidth);
  let offsetY = y - ((lines.length - 1) * fontPx * 1.2) / 2;

  for (const line of lines) {
    const lineWidth = line.reduce((sum, glyph) => sum + ctx.measureText(glyph.ch).width, 0);
    let cursor = x - lineWidth / 2;
    for (const glyph of line) {
      const w = ctx.measureText(glyph.ch).width;
      ctx.globalAlpha = glyph.lit ? 1 : 0.38;
      ctx.strokeText(glyph.ch, cursor + w / 2, offsetY);
      ctx.fillText(glyph.ch, cursor + w / 2, offsetY);
      cursor += w;
    }
    offsetY += fontPx * 1.2;
  }
  ctx.globalAlpha = 1;
}

function toGlyphs(cue: Cue, timeMs: number, karaoke: boolean): Glyph[] {
  if (!karaoke) {
    return [...cue.text].map((ch) => ({ ch, lit: true }));
  }
  const glyphs: Glyph[] = [];
  for (const word of cue.words) {
    for (const ch of [...word.text]) {
      glyphs.push({ ch, lit: timeMs >= word.startMs });
    }
  }
  return glyphs.length ? glyphs : [...cue.text].map((ch) => ({ ch, lit: true }));
}

function wrapGlyphs(ctx: CanvasRenderingContext2D, glyphs: Glyph[], maxWidth: number) {
  const lines: Glyph[][] = [];
  let line: Glyph[] = [];
  let width = 0;
  for (const glyph of glyphs) {
    const w = ctx.measureText(glyph.ch).width;
    if (line.length && width + w > maxWidth) {
      lines.push(line);
      line = [];
      width = 0;
    }
    line.push(glyph);
    width += w;
  }
  if (line.length) lines.push(line);
  return lines;
}
