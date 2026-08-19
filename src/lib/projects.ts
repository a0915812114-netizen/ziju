import { charCount, newId } from "./cues";
import {
  defaultStyle,
  type AsrLanguage,
  type LayoutMode,
  type Orientation,
  type SubtitleStyle,
} from "./style";
import type { Cue } from "./types";

export type ProjectRecord = {
  id: string;
  name: string;
  cues: Cue[];
  style: SubtitleStyle;
  orientation: Orientation;
  layoutMode: LayoutMode;
  language: AsrLanguage;
  customWidth: number;
  customHeight: number;
  durationMs: number;
  marks: number[];
  cutPoints: number[];
  mediaName: string | null;
  thumbnail: string | null;
  updatedAt: number;
};

const KEY = "ziju-projects";

export function listProjects(): ProjectRecord[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string) {
  return readAll().find((item) => item.id === id) ?? null;
}

export function createProject(opts?: {
  layoutMode?: LayoutMode;
  language?: AsrLanguage;
  customWidth?: number;
  customHeight?: number;
}) {
  const layoutMode = opts?.layoutMode ?? "auto";
  const orientation: Orientation =
    layoutMode === "vertical" ||
    (layoutMode === "custom" && (opts?.customHeight ?? 16) > (opts?.customWidth ?? 9))
      ? "vertical"
      : "horizontal";
  const record: ProjectRecord = {
    id: newId(),
    name: "未命名專案",
    cues: [],
    style: defaultStyle(orientation),
    orientation,
    layoutMode,
    language: opts?.language ?? "auto",
    customWidth: opts?.customWidth ?? 1920,
    customHeight: opts?.customHeight ?? 1080,
    durationMs: 0,
    marks: [],
    cutPoints: [],
    mediaName: null,
    thumbnail: null,
    updatedAt: Date.now(),
  };
  saveProject(record);
  return record;
}

export function saveProject(record: ProjectRecord) {
  const all = readAll().filter((item) => item.id !== record.id);
  all.push({ ...record, updatedAt: Date.now() });
  writeAll(all);
}

export function deleteProject(id: string) {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function projectStats(project: ProjectRecord) {
  const chars = project.cues.reduce((sum, cue) => sum + charCount(cue.text), 0);
  const minutes = Math.max(project.durationMs / 60_000, 0.01);
  return {
    chars,
    cues: project.cues.length,
    cpm: Math.round(chars / minutes),
    done: project.cues.length > 0,
  };
}

export function fromNow(ts: number) {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 45) return "剛剛";
  if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

function readAll(): ProjectRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ProjectRecord>[]) : [];
    return parsed.map(normalize);
  } catch {
    return [];
  }
}

function normalize(item: Partial<ProjectRecord>): ProjectRecord {
  const orientation = item.orientation === "vertical" ? "vertical" : "horizontal";
  return {
    id: item.id ?? newId(),
    name: item.name ?? "未命名專案",
    cues: item.cues ?? [],
    style: item.style ?? defaultStyle(orientation),
    orientation,
    layoutMode: item.layoutMode ?? "auto",
    language: item.language ?? "auto",
    customWidth: item.customWidth ?? 1920,
    customHeight: item.customHeight ?? 1080,
    durationMs: item.durationMs ?? 0,
    marks: item.marks ?? [],
    cutPoints: item.cutPoints ?? [],
    mediaName: item.mediaName ?? null,
    thumbnail: item.thumbnail ?? null,
    updatedAt: item.updatedAt ?? Date.now(),
  };
}

function writeAll(records: ProjectRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(records));
  window.dispatchEvent(new Event("ziju-projects"));
}
