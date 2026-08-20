"use client";

import { MAX_MEDIA_MS } from "@/lib/extract-audio";
import { transcribeMedia, TranscribeError } from "@/lib/transcribe-client";
import { readDuration } from "@/lib/media-duration";
import { takePendingStyle } from "@/lib/heroes";
import { takePendingUpload } from "@/lib/pending-upload";
import { getProject, saveProject } from "@/lib/projects";
import type { AsrStatus, SeekOpts } from "@/lib/types";
import { peaksFromMedia, syntheticPeaks } from "@/lib/waveform";
import { useEditorStore } from "@/store/editor-store";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { CueList } from "./CueList";
import { PreviewPane } from "./PreviewPane";
import { StatusBar } from "./StatusBar";
import { Timeline } from "./Timeline";
import { Toolbar } from "./Toolbar";

export function EditorApp({ projectId }: { projectId: string }) {
  const router = useRouter();
  const mediaRef = useRef<HTMLVideoElement>(null);
  const setAsr = useEditorStore((s) => s.setAsr);
  const setJob = useEditorStore((s) => s.setJob);
  const setMedia = useEditorStore((s) => s.setMedia);
  const setCues = useEditorStore((s) => s.setCues);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setToast = useEditorStore((s) => s.setToast);
  const setAltMode = useEditorStore((s) => s.setAltMode);
  const glossary = useEditorStore((s) => s.glossary);
  const toast = useEditorStore((s) => s.toast);
  const job = useEditorStore((s) => s.job);
  const durationMs = useEditorStore((s) => s.durationMs);
  const mediaUrl = useEditorStore((s) => s.mediaUrl);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const removeCue = useEditorStore((s) => s.removeCue);
  const selectedId = useEditorStore((s) => s.selectedId);
  const toggleMark = useEditorStore((s) => s.toggleMark);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const setPeaks = useEditorStore((s) => s.setPeaks);
  const selectRelative = useEditorStore((s) => s.selectRelative);
  const loadProject = useEditorStore((s) => s.loadProject);
  const snapshotProject = useEditorStore((s) => s.snapshotProject);

  useEffect(() => {
    const project = getProject(projectId);
    if (!project) {
      router.replace("/studio");
      return;
    }
    loadProject(project);
    const pendingStyle = takePendingStyle();
    if (pendingStyle) {
      useEditorStore.getState().applyStyle(pendingStyle.style, pendingStyle.orientation);
    }
    const pending = takePendingUpload(projectId);
    if (pending) window.setTimeout(() => void attachMedia(pending), 0);
  }, [projectId, loadProject, router]);

  useEffect(() => {
    return useEditorStore.subscribe((state, prev) => {
      if (prev.playing && !state.playing) mediaRef.current?.pause();
    });
  }, []);

  useEffect(() => {
    let timer = 0;
    const persist = () => {
      if (useEditorStore.getState().projectId !== projectId) return;
      const snap = snapshotProject();
      if (snap && snap.id === projectId) saveProject(snap);
    };
    const unsub = useEditorStore.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(persist, 450);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
      persist();
    };
  }, [projectId, snapshotProject]);

  useEffect(() => {
    fetch("/api/transcribe")
      .then((res) => res.json() as Promise<AsrStatus>)
      .then((status) => {
        setAsr({
          configured: status.configured,
          provider: status.provider,
          owner: Boolean(status.owner),
          remaining: status.remaining ?? null,
        });
        if (status.owner) setToast("已進入主人模式，聽打不限次數");
      })
      .catch(() =>
        setAsr({ configured: false, provider: null, owner: false, remaining: null }),
      );
  }, [setAsr, setToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltMode(event.type === "keydown");
      if (event.type !== "keydown") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        document.getElementById("ziju-cue-search")?.focus();
        return;
      }
      if (isTyping(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) useEditorStore.getState().redo();
        else useEditorStore.getState().undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        useEditorStore.getState().redo();
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (useEditorStore.getState().job.phase === "exporting") return;
        const node = mediaRef.current;
        if (!node?.src) return;
        if (node.paused) void node.play();
        else node.pause();
      }
      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        if (!splitAtPlayhead()) setToast("把播放頭放在字幕上，再按 B 切斷");
      }
      if (event.key === "Delete" && selectedId) {
        event.preventDefault();
        removeCue(selectedId);
      }
      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        toggleMark(currentTimeMs);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const id = selectRelative(-1);
        const cue = useEditorStore.getState().cues.find((item) => item.id === id);
        if (cue) seek(cue.startMs, { play: true });
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const id = selectRelative(1);
        const cue = useEditorStore.getState().cues.find((item) => item.id === id);
        if (cue) seek(cue.startMs, { play: true });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", () => setAltMode(false));
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [setAltMode, splitAtPlayhead, setToast, selectedId, removeCue, toggleMark, currentTimeMs, selectRelative]);

  useEffect(() => {
    if (!mediaUrl) return;
    let cancelled = false;
    peaksFromMedia(mediaUrl)
      .then((peaks) => {
        if (!cancelled) setPeaks(peaks);
      })
      .catch(() => {
        if (!cancelled) setPeaks(syntheticPeaks(1200));
      });
    return () => {
      cancelled = true;
    };
  }, [mediaUrl, setPeaks]);

  async function attachMedia(file: File) {
    const duration = await readDuration(file);
    setMedia(file, duration);
    setJob({ phase: "ready", progress: 1, message: "" });
    const first = useEditorStore.getState().cues[0];
    if (!first) return;
    window.setTimeout(() => {
      if (mediaRef.current) mediaRef.current.currentTime = first.startMs / 1000;
      setCurrentTime(first.startMs);
    }, 80);
  }

  async function handleFile(file: File) {
    try {
      setJob({ phase: "extracting", progress: 0, message: "讀取檔案…" });
      const duration = await readDuration(file);
      if (duration > MAX_MEDIA_MS) {
        setJob({ phase: "error", progress: 0, message: "目前最長 40 分鐘。請先剪短再製作。" });
        return;
      }
      setMedia(file, duration);
      const cues = await transcribeMedia({
        file,
        language: useEditorStore.getState().language,
        glossary,
        durationMs: duration,
        signal: new AbortController().signal,
        onExtract: (progress, message) => {
          setJob({ phase: "extracting", progress, message });
        },
        onTranscribe: (progress, message) => {
          setJob({ phase: "transcribing", progress, message });
        },
      });
      setCues(cues);
      const first = cues[0];
      if (first) seek(first.startMs);
      setJob({ phase: "ready", progress: 1, message: "" });
      setToast(`聽打完成，共 ${cues.length} 句`);
    } catch (error) {
      if (error instanceof TranscribeError) {
        if (error.code === "NO_KEY") {
          setJob({
            phase: "ready",
            progress: 1,
            message: "尚未設定聽打金鑰，可先對波形與時間",
          });
          setToast("尚未設定 API 金鑰。影片留在時間軸上，可先練習拖曳與切點。");
          return;
        }
        if (error.code === "RATE_LIMITED" || error.code === "TOO_LARGE" || error.code === "EMPTY") {
          setJob({ phase: "ready", progress: 1, message: "" });
          setToast(error.message);
          return;
        }
      }
      const message = error instanceof Error ? error.message : "處理失敗";
      setJob({ phase: "error", progress: 0, message });
    }
  }

  function seek(ms: number, opts?: SeekOpts) {
    const node = mediaRef.current;
    const time = Math.max(0, ms);
    setCurrentTime(time);
    const view = useEditorStore.getState();
    const viewEnd = view.viewStartMs + view.viewDurationMs;
    if (time < view.viewStartMs || time > viewEnd) {
      view.setView(time - view.viewDurationMs * 0.2, view.viewDurationMs);
    }
    if (!node) return;
    node.currentTime = time / 1000;
    if (opts?.play) void node.play();
    else if (opts?.pause) node.pause();
  }

  return (
    <div className="relative flex h-dvh flex-col bg-[var(--bg)] text-[var(--text)]">
      <Toolbar onPickFile={handleFile} mediaRef={mediaRef} />
      {job.phase === "extracting" || job.phase === "transcribing" || job.phase === "exporting" ? (
        <div className="h-1 bg-[var(--line)]">
          <div
            className="h-full bg-[var(--accent)] transition-all"
            style={{ width: `${Math.round(job.progress * 100)}%` }}
          />
        </div>
      ) : null}
      <Timeline onSeek={seek} mediaRef={mediaRef} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,0.85fr)_minmax(360px,1.15fr)]">
        <PreviewPane
          mediaRef={mediaRef}
          onTime={setCurrentTime}
          onDuration={(ms) => {
            if (ms > 0 && Math.abs(ms - durationMs) > 250) {
              useEditorStore.setState({ durationMs: ms });
            }
          }}
        />
        <CueList onSeek={seek} />
      </div>
      <StatusBar onSeek={seek} />
      {toast ||
      job.phase === "error" ||
      job.phase === "extracting" ||
      job.phase === "transcribing" ||
      job.phase === "exporting" ? (
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#111] px-4 py-2 text-sm text-white">
          {job.phase === "exporting"
            ? `${job.message} ${Math.round(job.progress * 100)}%`
            : job.phase === "error"
              ? job.message
              : (toast ?? job.message)}
        </div>
      ) : null}
    </div>
  );
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
