"use client";

import { extractAudio } from "@/lib/extract-audio";
import type { AsrStatus, Cue } from "@/lib/types";
import { peaksFromMedia, syntheticPeaks } from "@/lib/waveform";
import { useEditorStore } from "@/store/editor-store";
import { useEffect, useRef } from "react";
import { CueList } from "./CueList";
import { PreviewPane } from "./PreviewPane";
import { StatusBar } from "./StatusBar";
import { Timeline } from "./Timeline";
import { Toolbar } from "./Toolbar";
import { TransportBar } from "./TransportBar";

export function EditorApp() {
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
      if (event.type !== "keydown" || isTyping(event.target)) return;
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
        if (cue && mediaRef.current) mediaRef.current.currentTime = cue.startMs / 1000;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const id = selectRelative(1);
        const cue = useEditorStore.getState().cues.find((item) => item.id === id);
        if (cue && mediaRef.current) mediaRef.current.currentTime = cue.startMs / 1000;
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

  async function handleFile(file: File) {
    try {
      setJob({ phase: "extracting", progress: 0, message: "讀取檔案…" });
      const duration = await readDuration(file);
      setMedia(file, duration);
      const audio = await extractAudio(file, (progress, message) => {
        setJob({ phase: "extracting", progress, message });
      });
      setJob({ phase: "transcribing", progress: 0.9, message: "正在聽打…" });
      const body = new FormData();
      body.set("audio", audio);
      body.set("glossary", glossary.join("\n"));
      const response = await fetch("/api/transcribe", { method: "POST", body });
      const payload = (await response.json()) as {
        cues?: Cue[];
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.cues) {
        if (payload.error === "NO_KEY") {
          setJob({
            phase: "ready",
            progress: 1,
            message: "尚未設定聽打金鑰，可先對波形與時間",
          });
          setToast("尚未設定 API 金鑰。影片留在時間軸上，可先練習拖曳與切點。");
          return;
        }
        if (payload.error === "RATE_LIMITED") {
          setJob({ phase: "ready", progress: 1, message: "" });
          setToast(payload.message ?? "公開聽打次數用完了，仍可編輯與燒字幕");
          return;
        }
        if (payload.error === "TOO_LARGE") {
          setJob({ phase: "ready", progress: 1, message: "" });
          setToast(payload.message ?? "音訊太大，請改用較短片段");
          return;
        }
        throw new Error(payload.message ?? "聽打失敗");
      }
      setCues(payload.cues);
      setJob({ phase: "ready", progress: 1, message: "" });
      setToast(`聽打完成，共 ${payload.cues.length} 句`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "處理失敗";
      setJob({ phase: "error", progress: 0, message });
    }
  }

  function seek(ms: number) {
    const node = mediaRef.current;
    if (node) node.currentTime = ms / 1000;
    setCurrentTime(ms);
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
      <Timeline onSeek={seek} />
      <TransportBar mediaRef={mediaRef} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,1.1fr)_minmax(320px,0.9fr)]">
        <PreviewPane
          mediaRef={mediaRef}
          onTime={(ms) => setCurrentTime(ms)}
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
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">
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

function readDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const node = document.createElement("video");
    node.preload = "metadata";
    node.src = url;
    node.onloadedmetadata = () => {
      resolve(Math.round((node.duration || 0) * 1000));
      URL.revokeObjectURL(url);
    };
    node.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}
