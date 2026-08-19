"use client";

import { create } from "zustand";
import type { AsrLanguage } from "@/lib/style";

export type MakeStep = "upload" | "transcribe" | "split" | "save";

type MakeState = {
  running: boolean;
  minimized: boolean;
  done: boolean;
  projectId: string | null;
  fileName: string;
  step: MakeStep;
  stepProgress: number;
  startedAt: number;
  elapsedMs: number;
  cueCount: number;
  error: string | null;
  abort: AbortController | null;
  setStep: (step: MakeStep, progress?: number) => void;
  start: (opts: {
    projectId: string;
    file: File;
    language: AsrLanguage;
    glossary: string[];
  }) => void;
  cancel: () => void;
  minimize: () => void;
  restore: () => void;
  finish: (stats: { cueCount: number }) => void;
  fail: (message: string) => void;
  dismiss: () => void;
};

const idle = {
  running: false,
  minimized: false,
  done: false,
  projectId: null as string | null,
  fileName: "",
  step: "upload" as MakeStep,
  stepProgress: 0,
  startedAt: 0,
  elapsedMs: 0,
  cueCount: 0,
  error: null as string | null,
  abort: null as AbortController | null,
};

export const useMakeStore = create<MakeState>((set, get) => ({
  ...idle,
  setStep: (step, progress = 0) => set({ step, stepProgress: progress, error: null }),
  start: (opts) => {
    get().abort?.abort();
    const abort = new AbortController();
    set({
      ...idle,
      running: true,
      projectId: opts.projectId,
      fileName: opts.file.name,
      startedAt: Date.now(),
      abort,
    });
    void runMake(opts, abort);
  },
  cancel: () => {
    get().abort?.abort();
    set(idle);
  },
  minimize: () => set({ minimized: true }),
  restore: () => set({ minimized: false }),
  finish: (stats) =>
    set((state) => ({
      running: false,
      minimized: false,
      abort: null,
      step: "save",
      stepProgress: 1,
      done: true,
      error: null,
      cueCount: stats.cueCount,
      elapsedMs: Date.now() - state.startedAt,
    })),
  fail: (message) =>
    set((state) => ({
      running: false,
      error: message,
      abort: null,
      done: false,
      elapsedMs: Date.now() - state.startedAt,
    })),
  dismiss: () => set(idle),
}));

function dropEmptyProject(projectId: string) {
  void import("@/lib/projects").then(({ getProject, deleteProject }) => {
    const project = getProject(projectId);
    if (project && project.cues.length === 0) deleteProject(projectId);
  });
}

async function runMake(
  opts: {
    projectId: string;
    file: File;
    language: AsrLanguage;
    glossary: string[];
  },
  abort: AbortController,
) {
  const { makeSubtitles } = await import("@/lib/make-subtitles");
  try {
    const result = await makeSubtitles(opts, abort.signal);
    if (abort.signal.aborted) return;
    if (result.cueCount === 0) {
      dropEmptyProject(opts.projectId);
      useMakeStore.getState().fail("沒聽出字幕。請確認片子有人聲，再試一次。");
      return;
    }
    useMakeStore.getState().finish({ cueCount: result.cueCount });
  } catch (error) {
    if (abort.signal.aborted) return;
    dropEmptyProject(opts.projectId);
    const message = error instanceof Error ? error.message : "製作失敗";
    useMakeStore.getState().fail(message);
  }
}
