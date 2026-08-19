"use client";

import { create } from "zustand";
import {
  createCue,
  currentCueIndex,
  mergeCues,
  parseSrt,
  replaceInCues,
  sortCues,
  splitCue,
  splitCueAtTime,
  toSrt,
  toTranscript,
} from "@/lib/cues";
import { DEMO_CUT_POINTS } from "@/lib/cuts";
import { DEMO_CUES, DEMO_MEDIA_LABEL } from "@/lib/demo-project";
import { clamp } from "@/lib/snap";
import { defaultStyle, type Orientation, type SubtitleStyle } from "@/lib/style";
import type { AsrStatus, Cue, JobStatus } from "@/lib/types";
import { syntheticPeaks } from "@/lib/waveform";

const MIN_CUE_MS = 80;
const MIN_VIEW_MS = 1500;

type EditorState = {
  name: string;
  cues: Cue[];
  selectedId: string | null;
  currentTimeMs: number;
  durationMs: number;
  mediaUrl: string | null;
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
  showSafeFrame: boolean;
  style: SubtitleStyle;
  playbackRate: number;
  showStyle: boolean;
  showShortcuts: boolean;
  setAsr: (asr: AsrStatus) => void;
  setJob: (job: Partial<JobStatus> & Pick<JobStatus, "phase">) => void;
  setMedia: (file: File, durationMs: number) => void;
  clearMedia: () => void;
  setCues: (cues: Cue[]) => void;
  setCurrentTime: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  selectCue: (id: string | null) => void;
  updateCueText: (id: string, text: string) => void;
  setCueTiming: (id: string, startMs: number, endMs: number) => void;
  addCueAt: (startMs: number, endMs: number) => string;
  removeCue: (id: string) => void;
  splitSelected: (charIndex: number) => void;
  splitAtPlayhead: () => boolean;
  selectRelative: (dir: -1 | 1) => string | null;
  mergeWithPrevious: (id: string) => void;
  replaceAll: () => number;
  addGlossary: (term: string) => void;
  removeGlossary: (term: string) => void;
  toggleMark: (ms: number) => void;
  setCutPoints: (points: number[]) => void;
  setCutDetectProgress: (progress: number | null) => void;
  setPeaks: (peaks: number[]) => void;
  setView: (startMs: number, durationMs: number) => void;
  setOrientation: (orientation: Orientation) => void;
  setShowSafeFrame: (on: boolean) => void;
  patchStyle: (patch: Partial<SubtitleStyle>) => void;
  setPlaybackRate: (rate: number) => void;
  setShowStyle: (on: boolean) => void;
  setShowShortcuts: (on: boolean) => void;
  importSrt: (raw: string) => number;
  loadDemo: () => void;
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
  name: "未命名專案",
  cues: [],
  selectedId: null,
  currentTimeMs: 0,
  durationMs: 0,
  mediaUrl: null,
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
  showSafeFrame: true,
  style: defaultStyle("horizontal"),
  playbackRate: 1,
  showStyle: false,
  showShortcuts: false,
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
      mediaName: file.name,
      name: file.name.replace(/\.[^.]+$/, ""),
      durationMs,
      currentTimeMs: 0,
      marks: [],
      cutPoints: [],
      peaks: [],
      playing: false,
      ...fitView(durationMs),
    });
  },
  clearMedia: () => {
    revoke(get().mediaUrl);
    set({
      mediaUrl: null,
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
      job: { phase: "ready", progress: 1, message: `共 ${sorted.length} 句` },
    });
  },
  setCurrentTime: (ms) => set({ currentTimeMs: Math.max(0, ms) }),
  setPlaying: (playing) => set({ playing }),
  selectCue: (id) => set({ selectedId: id }),
  updateCueText: (id, text) =>
    set((state) => ({
      cues: state.cues.map((cue) => (cue.id === id ? { ...cue, text } : cue)),
    })),
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
    const cue = createCue(startMs, endMs, "");
    set((state) => ({
      cues: sortCues([...state.cues, cue]),
      selectedId: cue.id,
    }));
    return cue.id;
  },
  removeCue: (id) =>
    set((state) => {
      const cues = state.cues.filter((cue) => cue.id !== id);
      return {
        cues,
        selectedId: state.selectedId === id ? (cues[0]?.id ?? null) : state.selectedId,
      };
    }),
  splitSelected: (charIndex) => {
    const { cues, selectedId } = get();
    const index = cues.findIndex((cue) => cue.id === selectedId);
    if (index < 0) return;
    const cue = cues[index];
    if (!cue) return;
    const parts = splitCue(cue, charIndex);
    if (!parts) return;
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
    const merged = mergeCues(left, right);
    const next = [...cues];
    next.splice(index - 1, 2, merged);
    set({ cues: next, selectedId: merged.id });
  },
  replaceAll: () => {
    const { cues, findText, replaceText } = get();
    const result = replaceInCues(cues, findText, replaceText);
    set({ cues: result.cues });
    if (replaceText.trim() && result.count > 0) {
      get().addGlossary(replaceText.trim());
    }
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
  setShowSafeFrame: (showSafeFrame) => set({ showSafeFrame }),
  patchStyle: (patch) =>
    set((state) => ({ style: { ...state.style, ...patch } })),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setShowStyle: (showStyle) => set({ showStyle }),
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
  importSrt: (raw) => {
    const cues = parseSrt(raw);
    if (cues.length === 0) return 0;
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
      mediaName: DEMO_MEDIA_LABEL,
      durationMs: 17600,
      currentTimeMs: 0,
      playing: false,
      marks: [],
      cutPoints: DEMO_CUT_POINTS,
      peaks: syntheticPeaks(900),
      viewStartMs: 0,
      viewDurationMs: 17600,
      job: { phase: "ready", progress: 1, message: "示範稿，可練習波形與斷句" },
    });
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
