"use client";

import { PUBLIC_DAILY } from "@/lib/access";
import { toVtt } from "@/lib/cues";
import { downloadBlob, downloadText, exportBurnedVideo, type BurnMode } from "@/lib/export-video";
import type { AsrStatus } from "@/lib/types";
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
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const name = useEditorStore((s) => s.name);
  const cues = useEditorStore((s) => s.cues);
  const exportSrt = useEditorStore((s) => s.exportSrt);
  const exportTranscript = useEditorStore((s) => s.exportTranscript);
  const setToast = useEditorStore((s) => s.setToast);
  const setJob = useEditorStore((s) => s.setJob);
  const job = useEditorStore((s) => s.job);
  const asr = useEditorStore((s) => s.asr);
  const exporting = job.phase === "exporting";

  useEffect(() => {
    if (!open && !accountOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, accountOpen]);

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
      <Link href="/studio" className="text-[15px] font-bold tracking-wide">
        字句
      </Link>
      <span className="min-w-0 truncate text-sm">{name}</span>
      <div className="ml-auto flex items-center gap-4">
        {exporting ? (
          <button type="button" className="btn" onClick={cancelExport}>
            取消燒錄
          </button>
        ) : (
          <div className="relative" ref={menuRef}>
            <button type="button" className="btn primary px-4" onClick={() => setOpen((v) => !v)}>
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
        <Link href="/studio" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          我的影片與草稿
        </Link>
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]" aria-label="說明">
          ?
        </Link>
        <div className="relative" ref={accountRef}>
          <button
            type="button"
            className="flex items-center gap-2 text-sm"
            aria-label="帳號"
            onClick={() => setAccountOpen((v) => !v)}
          >
            {asr.owner ? "主人" : "訪客"}
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--accent-2)] px-1.5 text-xs font-bold text-[#0a0a0a]">
              {asr.owner ? "不限" : (asr.remaining ?? PUBLIC_DAILY)}
            </span>
          </button>
          {accountOpen ? (
            <AccountMenu
              asr={asr}
              onClose={() => setAccountOpen(false)}
              onPickFile={() => fileRef.current?.click()}
              onRetranscribe={() => {
                const file = useEditorStore.getState().mediaFile;
                if (!file) {
                  setToast("請先接回影片，再重新聽打。");
                  return;
                }
                onPickFile(file);
              }}
            />
          ) : null}
        </div>
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

function AccountMenu({
  asr,
  onClose,
  onPickFile,
  onRetranscribe,
}: {
  asr: AsrStatus;
  onClose: () => void;
  onPickFile: () => void;
  onRetranscribe: () => void;
}) {
  const setToast = useEditorStore((s) => s.setToast);
  const loadDemo = useEditorStore((s) => s.loadDemo);
  const glossary = useEditorStore((s) => s.glossary);
  const used = asr.owner ? 0 : Math.max(0, PUBLIC_DAILY - (asr.remaining ?? PUBLIC_DAILY));
  const total = asr.owner ? "不限" : String(PUBLIC_DAILY);
  const ratio = asr.owner ? 1 : used / PUBLIC_DAILY;

  return (
    <div className="absolute top-full right-0 z-40 mt-1 w-64 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm">
      <div className="mb-3">
        <div className="h-2 overflow-hidden rounded-full bg-[#efece4]">
          <div
            className="h-full rounded-full bg-[var(--accent-2)]"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          {asr.owner ? "主人模式 · 聽打不限次數" : `已用 ${used} · 本期共 ${total}`}
        </p>
      </div>
      <button
        type="button"
        className="w-full rounded-lg bg-[#111] px-3 py-2 text-sm font-medium text-white"
        onClick={() => {
          onClose();
          setToast("會員中心還沒做。現在用公開額度或主人連結。");
        }}
      >
        會員中心
      </button>
      <div className="mt-2 grid grid-cols-3 gap-1">
        <Link href="/" className="btn justify-center px-1 text-center text-[11px]" onClick={onClose}>
          官網首頁
        </Link>
        <button
          type="button"
          className="btn px-1 text-[11px]"
          onClick={() => {
            onClose();
            setToast("切換帳號還沒做");
          }}
        >
          切換帳號
        </button>
        <button
          type="button"
          className="btn px-1 text-[11px]"
          onClick={() => {
            onClose();
            setToast("還沒有登入，因此沒有登出");
          }}
        >
          登出
        </button>
      </div>
      <button
        type="button"
        className="mt-2 w-full text-left text-xs text-[var(--muted)] hover:text-[var(--text)]"
        onClick={() => {
          onClose();
          onPickFile();
        }}
      >
        接回影片
      </button>
      <button
        type="button"
        className="mt-1 w-full text-left text-xs text-[var(--muted)] hover:text-[var(--text)]"
        onClick={() => {
          onClose();
          onRetranscribe();
        }}
      >
        重新聽打
      </button>
      <Link
        href="/studio/heroes"
        className="mt-1 block w-full text-left text-xs text-[var(--muted)] hover:text-[var(--text)]"
        onClick={onClose}
      >
        英雄榜
      </Link>
      <button
        type="button"
        className="mt-1 w-full text-left text-xs text-[var(--muted)] hover:text-[var(--text)]"
        onClick={() => {
          onClose();
          loadDemo();
        }}
      >
        載入示範稿
      </button>
      <button
        type="button"
        className="mt-1 w-full text-left text-xs text-[var(--muted)] hover:text-[var(--text)]"
        onClick={() => {
          onClose();
          setToast(
            glossary.length
              ? `詞庫 ${glossary.length} 詞。點字幕列的詞可移除。`
              : "詞庫還是空的，改字或取代時會記進去。",
          );
        }}
      >
        我的詞庫與字型
      </button>
    </div>
  );
}
