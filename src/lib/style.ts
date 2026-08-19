export type Orientation = "horizontal" | "vertical";
export type LayoutMode = "auto" | "horizontal" | "vertical" | "custom";
export type AsrLanguage = string;
export type StyleAnimation = "none" | "fade" | "zoom" | "pop";

export type SubtitleStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  x: number;
  y: number;
  karaoke: boolean;
  animation: StyleAnimation;
  bilingual: boolean;
};

export const FONTS = [
  { id: 'var(--font-noto), "Noto Sans TC", sans-serif', label: "Noto Sans TC" },
  { id: 'var(--font-noto-serif), "Noto Serif TC", serif', label: "Noto Serif TC" },
  { id: '"Microsoft JhengHei", sans-serif', label: "微軟正黑體" },
  { id: "system-ui, sans-serif", label: "系統預設" },
];

export const SAFE_FRAME = {
  vertical: { l: 5.6, t: 5.6, r: 11.1, b: 16.7 },
  horizontal: { l: 5, t: 5, r: 5, b: 13 },
} as const;

export function defaultStyle(orientation: Orientation = "horizontal"): SubtitleStyle {
  const frame = SAFE_FRAME[orientation];
  return {
    fontFamily: 'var(--font-noto), "Noto Sans TC", sans-serif',
    fontSize: orientation === "vertical" ? 5.2 : 4.4,
    color: "#ffffff",
    strokeColor: "#111111",
    strokeWidth: 0.18,
    x: 50,
    y: 100 - frame.b - 3,
    karaoke: true,
    animation: "none",
    bilingual: false,
  };
}

export function snapIntoSafe(
  x: number,
  y: number,
  orientation: Orientation,
  threshold = 2.4,
) {
  const frame = SAFE_FRAME[orientation];
  const xs = [frame.l + 8, 50, 100 - frame.r - 8];
  const ys = [frame.t + 6, 50, 100 - frame.b - 3];
  return {
    x: nearest(x, xs, threshold),
    y: nearest(y, ys, threshold),
  };
}

function nearest(value: number, targets: number[], threshold: number) {
  let best = value;
  let dist = threshold;
  for (const target of targets) {
    const d = Math.abs(target - value);
    if (d <= dist) {
      best = target;
      dist = d;
    }
  }
  return best;
}
