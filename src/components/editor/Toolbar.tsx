"use client";

import { toVtt } from "@/lib/cues";
import { downloadBlob, downloadText, exportBurnedVideo, type BurnMode } from "@/lib/export-video";
import { useEditorStore } from "@/store/editor-store";
import Link from "next/link";
import { type RefObject, useEffect, useRef, useState } from "react";

type Props = {
  onPickFile: (file: File) => void;
  mediaRef: RefObject<HTMLVideoElement | null>;
};

export function Toolbar({ onPickFile, mediaRef }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const name = useEditorStore((s) => s.name);
  const cues = useEditorStore((s) => s.cues);
  const loadDemo = useEditorStore((s) => s.loadDemo);
  const exportSrt = useEditorStore((s) => s.exportSrt);
  const exportTranscript = useEditorStore((s) => s.exportTranscript);
  const setToast = useEditorStore((s) => s.setToast);
  const setJob = useEditorStore((s) => s.setJob);
  const glossary = useEditorStore((s) => s.glossary);
  const job = useEditorStore((s) => s.job);
  const exporting = job.phase === "exporting";

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function saveText(filename: string, content: string, type: string) {
    if (!cues.length) {
      setToast("還沒有字幕可匯出");
      return;
    }
    downloadText(filename, content, type);
    setOpen(false);
  }

  function cancelExport() {
    abortRef.current?.abort();
  }

  async function burn(mode: BurnMode) {
    setOpen(false);
    if (!cues.length) {
      setToast("還沒有字幕可匯出");
      return;
    }
    const { mediaUrl, style } = useEditorStore.getState();
    if (!mediaUrl) {
      setToast("請先接回影片");
      return;
    }
    mediaRef.current?.pause();
    const abort = new AbortController();
    abortRef.current = abort;
    setJob({ phase: "exporting", progress: 0, message: "準備燒字幕…" });
    try {
      const { blob, ext } = await exportBurnedVideo({
        mediaUrl,
        cues,
        style,
        mode,
        signal: abort.signal,
        onProgress: (progress, message) => setJob({ phase: "exporting", progress, message }),
      });
      const suffix = mode === "subs" ? "-黑底字幕" : "-字幕";
      downloadBlob(blob, `${name}${suffix}.${ext}`);
      setJob({ phase: "ready", progress: 1, message: "" });
      setToast(ext === "webm" ? "已匯出 WebM，剪輯軟體可直接匯入" : "已匯出成品影片");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setJob({ phase: "ready", progress: 0, message: "" });
        setToast("已取消燒錄");
        return;
      }
      const message = error instanceof Error ? error.message : "燒字幕失敗";
      setJob({ phase: "error", progress: 0, message });
      setToast(message);
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <header className="flex h-12 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4">
      <Link href="/" className="text-sm font-bold tracking-wide">
        字句
      </Link>
      <span className="max-w-xs truncate font-mono text-xs text-[var(--muted)]">
        {name}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          上傳
        </button>
        <button type="button" className="btn" onClick={loadDemo}>
          示範稿
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            setToast(
              glossary.length
                ? `詞庫 ${glossary.length} 詞。點字幕列的詞可移除。`
                : "詞庫還是空的，改字或取代時會記進去。",
            )
          }
        >
          我的詞庫與字型
        </button>
        {exporting ? (
          <button type="button" className="btn" onClick={cancelExport}>
            取消燒錄
          </button>
        ) : (
          <div className="relative" ref={menuRef}>
            <button type="button" className="btn primary" onClick={() => setOpen((v) => !v)}>
              匯出
            </button>
            {open ? (
              <div className="absolute top-full right-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] py-1 text-sm">
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => saveText(`${name}.srt`, exportSrt(), "application/x-subrip")}
                >
                  SRT 字幕
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => saveText(`${name}.vtt`, toVtt(cues), "text/vtt")}
                >
                  VTT 字幕
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() =>
                    saveText(`${name}.txt`, exportTranscript(), "text/plain;charset=utf-8")
                  }
                >
                  逐字稿
                </button>
                <div className="my-1 h-px bg-[var(--line)]" />
                <button type="button" className="menu-item" onClick={() => void burn("burn")}>
                  成品影片（燒字幕）
                </button>
                <button type="button" className="menu-item" onClick={() => void burn("subs")}>
                  黑底字幕（給剪輯）
                </button>
              </div>
            ) : null}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPickFile(file);
            event.target.value = "";
          }}
        />
      </div>
    </header>
  );
}
