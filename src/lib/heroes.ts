import type { StylePreset } from "./style-presets";
import { STYLE_PRESETS } from "./style-presets";

const KEY = "ziju-heroes";

export function listHeroes(): StylePreset[] {
  return [...STYLE_PRESETS, ...readPublished()];
}

export function publishHero(preset: StylePreset) {
  const next = [preset, ...readPublished().filter((item) => item.id !== preset.id)].slice(0, 40);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function applyPendingStyle(style: StylePreset["style"], orientation: StylePreset["orientation"]) {
  localStorage.setItem(
    "ziju-pending-style",
    JSON.stringify({ style, orientation, at: Date.now() }),
  );
}

export function takePendingStyle() {
  try {
    const raw = localStorage.getItem("ziju-pending-style");
    if (!raw) return null;
    localStorage.removeItem("ziju-pending-style");
    return JSON.parse(raw) as {
      style: StylePreset["style"];
      orientation: StylePreset["orientation"];
    };
  } catch {
    return null;
  }
}

function readPublished(): StylePreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StylePreset[]) : [];
  } catch {
    return [];
  }
}
