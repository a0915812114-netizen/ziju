"use client";

import { create } from "zustand";
import {
  createCue,
  currentCueIndex,
  mergeCues,
  parseSrt,
  replaceInCues,
  replaceInCue,
  sortCues,
  splitCue,
  splitCueAtTime,
  toSrt,
  toTranscript,
} from "@/lib/cues";
import { DEMO_CUT_POINTS } from "@/lib/cuts";
import { DEMO_CUES, DEMO_MEDIA_LABEL } from "@/lib/demo-project";
import { getProject, type ProjectRecord } from "@/lib/projects";
import { clamp } from "@/lib/snap";
import {
  defaultStyle,
  type AsrLanguage,
  type LayoutMode,
  type Orientation,
  type SubtitleStyle,
} from "@/lib/style";
import type { AsrStatus, Cue, JobStatus } from "@/lib/types";
import { syntheticPeaks } from "@/lib/waveform";

const MIN_CUE_MS = 80;
const MIN_VIEW_MS = 1500;
const HISTORY_LIMIT = 50;

type CueSnapshot = {
  cues: Cue[];
  selectedId: string | null;
  marks: number[];
};

type EditorState = {
  projectId: string | null;
  name: string;
  cues: Cue[];
  selectedId: string | null;
  currentTimeMs: number;
  durationMs: number;
  mediaUrl: string | null;
  mediaFile: File | null;
  mediaName: string | null;
  glossary: string[];
  job: JobStatus;
  asr: AsrStatus;
  findText: string;
  replaceText: string;
  toast: string | null;
  altMode: boolean;
  playing: boolean;
  marks: number[];
  cutPoints: number[];
  peaks: number[];
  viewStartMs: number;
  viewDurationMs: number;
  cutDetectProgress: number | null;
  orientation: Orientation;
  layoutMode: LayoutMode;
  language: AsrLanguage;
  showSafeFrame: boolean;
  style: SubtitleStyle;
  playbackRate: number;
  volume: number;
  showStyle: boolean;
  showShortcuts: boolean;
  past: CueSnapshot[];
  future: CueSnapshot[];
  setAsr: (asr: AsrStatus) => void;
  setJob: (job: Partial<JobStatus> & Pick<JobStatus, "phase">) => void;
  setMedia: (file: File, durationMs: number) => void;
  clearMedia: () => void;
  setCues: (cues: Cue[]) => void;
  setCurrentTime: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  selectCue: (id: string | null) => void;
  updateCueText: (id: string, text: string, record?: boolean) => void;
  setCueTiming: (id: string, startMs: number, endMs: number) => void;
  addCueAt: (startMs: number, endMs: number) => string;
  removeCue: (id: string) => void;
  splitSelected: (charIndex: number) => void;
  splitAtPlayhead: () => boolean;
  selectRelative: (dir: -1 | 1) => string | null;
  mergeWithPrevious: (id: string) => void;
  replaceAll: () => number;
  replaceInSelected: () => number;
  addGlossary: (term: string) => void;
  removeGlossary: (term: string) => void;
  toggleMark: (ms: number) => void;
  setCutPoints: (points: number[]) => void;
  setCutDetectProgress: (progress: number | null) => void;
  setPeaks: (peaks: number[]) => void;
  setView: (startMs: number, durationMs: number) => void;
  setOrientation: (orientation: Orientation) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setShowSafeFrame: (on: boolean) => void;
  patchStyle: (patch: Partial<SubtitleStyle>) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setShowStyle: (on: boolean) => void;
  setShowShortcuts: (on: boolean) => void;
  recordHistory: () => void;
  undo: () => void;
  redo: () => void;
  importSrt: (raw: string) => number;
  loadDemo: () => void;
  loadProject: (project: ProjectRecord) => void;
  snapshotProject: () => ProjectRecord | null;
  setFind: (text: string) => void;
  setReplace: (text: string) => void;
  setToast: (text: string | null) => void;
  setAltMode: (on: boolean) => void;
  exportSrt: () => string;
  exportTranscript: () => string;
  cueAtPlayhead: () => Cue | null;
};

const idleJob: JobStatus = { phase: "idle", progress: 0, message: "" };

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function fitView(durationMs: number) {
  return { viewStartMs: 0, viewDurationMs: Math.max(durationMs, MIN_VIEW_MS) };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  name: "未命名專案",
  cues: [],
  selectedId: null,
  currentTimeMs: 0,
  durationMs: 0,
  mediaUrl: null,
  mediaFile: null,
  mediaName: null,
  glossary: readGlossary(),
  job: idleJob,
  asr: { configured: false, provider: null, owner: false, remaining: null },
  findText: "",
  replaceText: "",
  toast: null,
  altMode: false,
  playing: false,
  marks: [],
  cutPoints: [],
  peaks: [],
  viewStartMs: 0,
  viewDurationMs: MIN_VIEW_MS,
  cutDetectProgress: null,
  orientation: "horizontal",
  layoutMode: "auto",
  language: "auto",
  showSafeFrame: true,
  style: defaultStyle("horizontal"),
  playbackRate: 1,
  volume: 1,
  showStyle: false,
  showShortcuts: false,
  past: [],
  future: [],
  setAsr: (asr) => set({ asr }),
  setJob: (job) =>
    set((state) => ({
      job: {
        phase: job.phase,
        progress: job.progress ?? state.job.progress,
        message: job.message ?? state.job.message,
      },
    })),
  setMedia: (file, durationMs) => {
    revoke(get().mediaUrl);
    set({
      mediaUrl: URL.createObjectURL(file),
      mediaFile: file,
      mediaName: file.name,
      name: file.name.replace(/\.[^.]+$/, ""),
      durationMs,
      currentTimeMs: 0,
      marks: [],
      cutPoints: [],
      peaks: [],
      playing: false,
      past: [],
      future: [],
      ...fitView(durationMs),
    });
  },
  clearMedia: () => {
    revoke(get().mediaUrl);
    set({
      mediaUrl: null,
      mediaFile: null,
      mediaName: null,
      durationMs: 0,
      currentTimeMs: 0,
      peaks: [],
      marks: [],
      cutPoints: [],
      playing: false,
      ...fitView(0),
    });
  },
  setCues: (cues) => {
    const sorted = sortCues(cues);
    set({
      cues: sorted,
      selectedId: sorted[0]?.id ?? null,
      currentTimeMs: sorted[0]?.startMs ?? get().currentTimeMs,
      past: [],
      future: [],
      job: { phase: "ready", progress: 1, message: `共 ${sorted.length} 句` },
    });
  },
  setCurrentTime: (ms) => set({ currentTimeMs: Math.max(0, ms) }),
  setPlaying: (playing) => set({ playing }),
  selectCue: (id) => set({ selectedId: id }),
  recordHistory: () => {
    const state = get();
    set({
      past: [...state.past.slice(-(HISTORY_LIMIT - 1)), capture(state)],
      future: [],
    });
  },
  undo: () => {
    const state = get();
    const prev = state.past[state.past.length - 1];
    if (!prev) return;
    set({
      past: state.past.slice(0, -1),
      future: [...state.future, capture(state)],
      cues: prev.cues,
      selectedId: prev.selectedId,
      marks: prev.marks,
    });
  },
  redo: () => {
    const state = get();
    const next = state.future[state.future.length - 1];
    if (!next) return;
    set({
      future: state.future.slice(0, -1),
      past: [...state.past, capture(state)],
      cues: next.cues,
      selectedId: next.selectedId,
      marks: next.marks,
    });
  },
  updateCueText: (id, text, record = true) => {
    if (record) get().recordHistory();
    set((state) => ({
      cues: state.cues.map((cue) => (cue.id === id ? { ...cue, text } : cue)),
    }));
  },
  setCueTiming: (id, startMs, endMs) => {
    const duration = get().durationMs;
    const start = clamp(Math.min(startMs, endMs), 0, Math.max(0, duration - MIN_CUE_MS));
    const end = clamp(Math.max(startMs, endMs, start + MIN_CUE_MS), start + MIN_CUE_MS, Math.max(start + MIN_CUE_MS, duration));
    set((state) => ({
      cues: sortCues(
        state.cues.map((cue) =>
          cue.id === id ? { ...cue, startMs: start, endMs: end } : cue,
        ),
      ),
    }));
  },
  addCueAt: (startMs, endMs) => {
    get().recordHistory();
    const cue = createCue(startMs, endMs, "");
    set((state) => ({
      cues: sortCues([...state.cues, cue]),
      selectedId: cue.id,
    }));
    return cue.id;
  },
  removeCue: (id) => {
    get().recordHistory();
    set((state) => {
      const cues = state.cues.filter((cue) => cue.id !== id);
      return {
        cues,
        selectedId: state.selectedId === id ? (cues[0]?.id ?? null) : state.selectedId,
      };
    });
  },
  splitSelected: (charIndex) => {
    const { cues, selectedId } = get();
    const index = cues.findIndex((cue) => cue.id === selectedId);
    if (index < 0) return;
    const cue = cues[index];
    if (!cue) return;
    const parts = splitCue(cue, charIndex);
    if (!parts) return;
    get().recordHistory();
    const next = [...cues];
    next.splice(index, 1, parts[0], parts[1]);
    set({ cues: sortCues(next), selectedId: parts[0].id });
  },
  splitAtPlayhead: () => {
    const { cues, currentTimeMs, selectedId } = get();
    const selected = cues.find((cue) => cue.id === selectedId);
    const target =
      selected && currentTimeMs > selected.startMs && currentTimeMs < selected.endMs
        ? selected
        : cues.find(
            (cue) => currentTimeMs > cue.startMs && currentTimeMs < cue.endMs,
          );
    if (!target) return false;
    const parts = splitCueAtTime(target, currentTimeMs);
    if (!parts) return false;
    get().recordHistory();
    const index = cues.findIndex((cue) => cue.id === target.id);
    const next = [...cues];
    next.splice(index, 1, parts[0], parts[1]);
    set({ cues: sortCues(next), selectedId: parts[0].id });
    return true;
  },
  selectRelative: (dir) => {
    const { cues, selectedId } = get();
    if (cues.length === 0) return null;
    const index = cues.findIndex((cue) => cue.id === selectedId);
    const nextIndex = clamp((index < 0 ? 0 : index) + dir, 0, cues.length - 1);
    const next = cues[nextIndex];
    if (!next) return null;
    set({ selectedId: next.id, currentTimeMs: next.startMs });
    return next.id;
  },
  mergeWithPrevious: (id) => {
    const { cues } = get();
    const index = cues.findIndex((cue) => cue.id === id);
    if (index <= 0) return;
    const left = cues[index - 1];
    const right = cues[index];
    if (!left || !right) return;
    get().recordHistory();
    const merged = mergeCues(left, right);
    const next = [...cues];
    next.splice(index - 1, 2, merged);
    set({ cues: next, selectedId: merged.id });
  },
  replaceAll: () => {
    const { cues, findText, replaceText } = get();
    const result = replaceInCues(cues, findText, replaceText);
    if (result.count === 0) return 0;
    get().recordHistory();
    set({ cues: result.cues });
    if (replaceText.trim()) get().addGlossary(replaceText.trim());
    return result.count;
  },
  replaceInSelected: () => {
    const { cues, selectedId, findText, replaceText } = get();
    const current = cues.find((cue) => cue.id === selectedId);
    if (!current) return 0;
    const result = replaceInCue(current, findText, replaceText);
    if (result.count === 0) return 0;
    get().recordHistory();
    set({
      cues: cues.map((cue) => (cue.id === current.id ? result.cue : cue)),
    });
    if (replaceText.trim()) get().addGlossary(replaceText.trim());
    return result.count;
  },
  addGlossary: (term) => {
    const cleaned = term.trim();
    if (!cleaned) return;
    set((state) => {
      if (state.glossary.includes(cleaned)) return state;
      const glossary = [...state.glossary, cleaned];
      writeGlossary(glossary);
      return { glossary, toast: `已把「${cleaned}」加入詞庫` };
    });
  },
  removeGlossary: (term) =>
    set((state) => {
      const glossary = state.glossary.filter((item) => item !== term);
      writeGlossary(glossary);
      return { glossary };
    }),
  toggleMark: (ms) => {
    const time = Math.round(ms);
    set((state) => {
      const exists = state.marks.find((mark) => Math.abs(mark - time) < 80);
      if (exists != null) {
        return { marks: state.marks.filter((mark) => mark !== exists) };
      }
      return { marks: [...state.marks, time].sort((a, b) => a - b), toast: "已加上對齊點" };
    });
  },
  setCutPoints: (cutPoints) => set({ cutPoints }),
  setCutDetectProgress: (cutDetectProgress) => set({ cutDetectProgress }),
  setPeaks: (peaks) => set({ peaks }),
  setView: (startMs, durationMs) => {
    const total = Math.max(get().durationMs, MIN_VIEW_MS);
    const viewDurationMs = clamp(durationMs, MIN_VIEW_MS, total);
    const viewStartMs = clamp(startMs, 0, Math.max(0, total - viewDurationMs));
    set({ viewStartMs, viewDurationMs });
  },
  setOrientation: (orientation) =>
    set((state) => ({
      orientation,
      style: {
        ...state.style,
        y: defaultStyle(orientation).y,
        fontSize: defaultStyle(orientation).fontSize,
      },
    })),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setShowSafeFrame: (showSafeFrame) => set({ showSafeFrame }),
  patchStyle: (patch) =>
    set((state) => ({ style: { ...state.style, ...patch } })),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setVolume: (volume) => set({ volume: clamp(volume, 0, 1) }),
  setShowStyle: (showStyle) => set({ showStyle }),
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
  importSrt: (raw) => {
    const cues = parseSrt(raw);
    if (cues.length === 0) return 0;
    get().recordHistory();
    set({
      cues,
      selectedId: cues[0]?.id ?? null,
      job: { phase: "ready", progress: 1, message: `已匯入 ${cues.length} 句` },
    });
    return cues.length;
  },
  loadDemo: () => {
    revoke(get().mediaUrl);
    set({
      name: DEMO_MEDIA_LABEL,
      cues: DEMO_CUES.map((cue) => ({ ...cue })),
      selectedId: DEMO_CUES[0]?.id ?? null,
      mediaUrl: null,
      mediaFile: null,
      mediaName: DEMO_MEDIA_LABEL,
      durationMs: 17600,
      currentTimeMs: 0,
      playing: false,
      marks: [],
      cutPoints: DEMO_CUT_POINTS,
      peaks: syntheticPeaks(900),
      viewStartMs: 0,
      viewDurationMs: 17600,
      past: [],
      future: [],
      job: { phase: "ready", progress: 1, message: "示範稿，可練習波形與斷句" },
    });
  },
  loadProject: (project) => {
    revoke(get().mediaUrl);
    set({
      projectId: project.id,
      name: project.name,
      cues: project.cues,
      selectedId: project.cues[0]?.id ?? null,
      currentTimeMs: project.cues[0]?.startMs ?? 0,
      durationMs: project.durationMs,
      mediaUrl: null,
      mediaFile: null,
      mediaName: project.mediaName,
      marks: project.marks,
      cutPoints: project.cutPoints,
      peaks: syntheticPeaks(900),
      playing: false,
      orientation: project.orientation,
      layoutMode: project.layoutMode,
      language: project.language,
      style: project.style,
      ...fitView(project.durationMs),
      past: [],
      future: [],
      job: {
        phase: "ready",
        progress: 1,
        message: project.cues.length ? `共 ${project.cues.length} 句` : "",
      },
    });
  },
  snapshotProject: () => {
    const state = get();
    if (!state.projectId) return null;
    const prev = getProject(state.projectId);
    return {
      id: state.projectId,
      name: state.name,
      cues: state.cues,
      style: state.style,
      orientation: state.orientation,
      layoutMode: state.layoutMode,
      language: state.language,
      customWidth: prev?.customWidth ?? 1920,
      customHeight: prev?.customHeight ?? 1080,
      durationMs: state.durationMs,
      marks: state.marks,
      cutPoints: state.cutPoints,
      mediaName: state.mediaName,
      thumbnail: prev?.thumbnail ?? null,
      updatedAt: Date.now(),
    };
  },
  setFind: (findText) => set({ findText }),
  setReplace: (replaceText) => set({ replaceText }),
  setToast: (toast) => set({ toast }),
  setAltMode: (altMode) => set({ altMode }),
  exportSrt: () => toSrt(get().cues),
  exportTranscript: () => toTranscript(get().cues),
  cueAtPlayhead: () => {
    const { cues, currentTimeMs } = get();
    const index = currentCueIndex(cues, currentTimeMs);
    return index >= 0 ? cues[index] ?? null : null;
  },
}));

function capture(state: { cues: Cue[]; selectedId: string | null; marks: number[] }): CueSnapshot {
  return {
    cues: state.cues,
    selectedId: state.selectedId,
    marks: state.marks,
  };
}

function readGlossary(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("ziju-glossary");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeGlossary(glossary: string[]) {
  localStorage.setItem("ziju-glossary", JSON.stringify(glossary));
}
