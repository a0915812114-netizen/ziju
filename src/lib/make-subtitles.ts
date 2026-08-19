"use client";

import { readDuration } from "./media-duration";
import { setPendingUpload } from "./pending-upload";
import { getProject, saveProject } from "./projects";
import type { AsrLanguage } from "./style";
import { TranscribeError, transcribeMedia } from "./transcribe-client";
import { useEditorStore } from "@/store/editor-store";
import { useMakeStore } from "@/store/make-store";

export async function makeSubtitles(
  opts: {
    projectId: string;
    file: File;
    language: AsrLanguage;
    glossary: string[];
  },
  signal: AbortSignal,
): Promise<{ cueCount: number }> {
  const { projectId, file, language, glossary } = opts;
  const setStep = useMakeStore.getState().setStep;
  if (signal.aborted) throw new DOMException("已取消", "AbortError");

  setStep("upload", 0.05);
  const durationMs = await readDuration(file);
  const cues = await transcribeMedia({
    file,
    language,
    glossary,
    durationMs,
    signal,
    onExtract: (progress) => {
      if (!signal.aborted) setStep("upload", Math.min(0.95, progress));
    },
    onTranscribe: (progress) => {
      if (!signal.aborted) setStep("transcribe", progress);
    },
  });
  if (cues.length === 0) {
    throw new TranscribeError("EMPTY", "沒聽出字幕。請確認片子有人聲，再試一次。");
  }
  if (signal.aborted) throw new DOMException("已取消", "AbortError");
  setStep("transcribe", 1);
  setStep("upload", 1);

  setStep("split", 0.35);
  await wait(450, signal);
  if (signal.aborted) throw new DOMException("已取消", "AbortError");

  setStep("split", 1);
  setStep("save", 0.4);
  const project = getProject(projectId);
  if (!project) throw new Error("找不到專案");
  saveProject({
    ...project,
    name: file.name.replace(/\.[^.]+$/, ""),
    cues,
    durationMs,
    mediaName: file.name,
  });
  setPendingUpload(projectId, file);

  const editor = useEditorStore.getState();
  if (editor.projectId === projectId) {
    const next = getProject(projectId);
    if (next) editor.loadProject(next);
    editor.setMedia(file, durationMs);
  }

  setStep("save", 1);
  await wait(250, signal);
  return { cueCount: cues.length };
}

export { readJson } from "./transcribe-client";

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("已取消", "AbortError"));
      },
      { once: true },
    );
  });
}
