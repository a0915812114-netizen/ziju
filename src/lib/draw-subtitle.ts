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

  const born = Math.max(0, timeMs - cue.startMs);
  const motion = motionFor(style.animation ?? "none", born);
  const fontPx = Math.max(16, (style.fontSize / 100) * width);
  ctx.save();
  ctx.translate((style.x / 100) * width, (style.y / 100) * height);
  ctx.scale(motion.scale, motion.scale);
  ctx.globalAlpha *= motion.alpha;
  ctx.font = `600 ${fontPx}px ${canvasFontFamily(style.fontFamily)}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(1, fontPx * 0.065 * (style.strokeWidth / 0.18));
  ctx.strokeStyle = style.strokeColor;
  ctx.fillStyle = style.color;

  const maxWidth = width * 0.86;
  const glyphs = toGlyphs(cue, timeMs, Boolean(style.karaoke && cue.words.length));
  const lines = wrapGlyphs(ctx, glyphs, maxWidth);
  const extra = style.bilingual && cue.translation?.trim() ? 1 : 0;
  let offsetY = -((lines.length - 1 + extra) * fontPx * 1.2) / 2;

  for (const line of lines) {
    const lineWidth = line.reduce((sum, glyph) => sum + ctx.measureText(glyph.ch).width, 0);
    let cursor = -lineWidth / 2;
    for (const glyph of line) {
      const w = ctx.measureText(glyph.ch).width;
      ctx.globalAlpha = motion.alpha * (glyph.lit ? 1 : 0.38);
      ctx.strokeText(glyph.ch, cursor + w / 2, offsetY);
      ctx.fillText(glyph.ch, cursor + w / 2, offsetY);
      cursor += w;
    }
    offsetY += fontPx * 1.2;
  }
  if (style.bilingual && cue.translation?.trim()) {
    ctx.globalAlpha = motion.alpha * 0.92;
    ctx.font = `500 ${Math.max(12, fontPx * 0.62)}px ${canvasFontFamily(style.fontFamily)}`;
    ctx.strokeText(cue.translation.trim(), 0, offsetY);
    ctx.fillText(cue.translation.trim(), 0, offsetY);
  }
  ctx.restore();
}

function motionFor(animation: SubtitleStyle["animation"], bornMs: number) {
  const t = Math.min(1, bornMs / 180);
  if (animation === "fade") return { alpha: t, scale: 1 };
  if (animation === "zoom") return { alpha: 1, scale: 0.86 + 0.14 * t };
  if (animation === "pop") return { alpha: 1, scale: 1.12 - 0.12 * t };
  return { alpha: 1, scale: 1 };
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
