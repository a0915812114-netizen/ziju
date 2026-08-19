"use client";

import { PUBLIC_DAILY } from "@/lib/access";
import { ASR_LANGUAGES } from "@/lib/languages";
import { readDuration } from "@/lib/media-duration";
import { createProject, saveProject } from "@/lib/projects";
import type { AsrLanguage, LayoutMode } from "@/lib/style";
import type { AsrStatus } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { useMakeStore } from "@/store/make-store";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const LAYOUTS: { id: LayoutMode; label: string }[] = [
  { id: "auto", label: "自動" },
  { id: "horizontal", label: "橫式" },
  { id: "vertical", label: "直式" },
  { id: "custom", label: "自訂" },
];

export function NewProject() {
  const asr = useEditorStore((s) => s.asr);
  const setAsr = useEditorStore((s) => s.setAsr);
  const glossary = useEditorStore((s) => s.glossary);
  const setToast = useEditorStore((s) => s.setToast);
  const toast = useEditorStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<AsrLanguage>("auto");
  const [layout, setLayout] = useState<LayoutMode>("auto");
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [minutes, setMinutes] = useState(1);
  const used = asr.owner ? 0 : Math.max(0, PUBLIC_DAILY - (asr.remaining ?? PUBLIC_DAILY));
  const remaining = asr.owner ? null : (asr.remaining ?? PUBLIC_DAILY);
  const cost = asr.owner ? 0 : 1;
  const making = useMakeStore((s) => s.running);

  useEffect(() => {
    fetch("/api/transcribe")
      .then((res) => res.json() as Promise<AsrStatus>)
      .then((status) =>
        setAsr({
          configured: status.configured,
          provider: status.provider,
          owner: Boolean(status.owner),
          remaining: status.remaining ?? null,
        }),
      )
      .catch(() =>
        setAsr({ configured: false, provider: null, owner: false, remaining: null }),
      );
  }, [setAsr]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  function pickFile(next: File | undefined) {
    if (!next) return;
    setFile(next);
    readDuration(next).then((ms) => setMinutes(Math.max(1, Math.ceil(ms / 60_000))));
  }

  function startMake() {
    if (!file || busy) return;
    if (useMakeStore.getState().running) {
      setToast("已有字幕在製作中，看左下角進度。");
      return;
    }
    if (remaining !== null && remaining < cost) {
      setToast("公開聽打次數用完了。仍可回專案列表改已有字幕。");
      return;
    }
    if (!asr.configured) {
      setToast("本機還沒設定聽打金鑰。請在 ziju 資料夾的 .env.local 寫入 GROQ_API_KEY 後重開 npm run dev。");
      return;
    }
    if (minutes > 40) {
      setToast("目前最長 40 分鐘。請先剪短再製作。");
      return;
    }
    setBusy(true);
    const project = createProject({
      layoutMode: layout,
      language,
      customWidth,
      customHeight,
    });
    saveProject({
      ...project,
      name: file.name.replace(/\.[^.]+$/, ""),
      mediaName: file.name,
    });
    useMakeStore.getState().start({
      projectId: project.id,
      file,
      language,
      glossary,
    });
    setBusy(false);
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-14 items-center gap-4 px-5">
        <Link href="/studio" className="text-lg font-semibold tracking-tight">
          字句
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/studio" className="text-[var(--muted)] hover:text-[var(--text)]">
            我的所有專案
          </Link>
          <button
            type="button"
            className="text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() =>
              setToast(
                glossary.length
                  ? `詞庫 ${glossary.length} 詞，會帶進這次聽打。`
                  : "詞庫還是空的。改字後會記在這台電腦。",
              )
            }
          >
            我的詞彙與字型
          </button>
          <Link href="/studio/heroes" className="text-[var(--muted)] hover:text-[var(--text)]">
            里程碑
          </Link>
          <span className="flex items-center gap-2">
            {asr.owner ? "主人" : "訪客"}
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--accent-2)] px-1.5 text-xs font-bold text-[#0a0a0a]">
              {asr.owner ? "不限" : remaining ?? PUBLIC_DAILY}
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6 py-10">
        <SettingsBar
          language={language}
          layout={layout}
          customWidth={customWidth}
          customHeight={customHeight}
          onLanguage={setLanguage}
          onLayout={setLayout}
          onWidth={setCustomWidth}
          onHeight={setCustomHeight}
        />

        <div
          className={`w-full rounded-3xl border border-dashed bg-[var(--panel)] px-8 py-14 text-center ${dragging ? "border-[var(--accent)]" : "border-[var(--line)]"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pickFile(event.dataTransfer.files[0]);
          }}
        >
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-2)] text-3xl text-[#0a0a0a]">
            ↑
          </div>
          {file ? (
            <>
              <p className="mx-auto max-w-lg truncate text-xl font-semibold">{file.name}</p>
              <p className="mt-2 text-[var(--muted)]">設定好上面的語言與版式，就可以開始</p>
              <p className="mt-1 text-xs text-[var(--muted)]">約 {minutes} 分鐘</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  className="btn px-5 py-2"
                  onClick={() => {
                    setFile(null);
                    fileRef.current?.click();
                  }}
                >
                  換一個檔案
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-3 rounded-full bg-[#111] px-6 py-2.5 text-sm font-medium text-white"
                  disabled={busy || making}
                  onClick={startMake}
                >
                  {making ? "製作中…" : busy ? "建立專案中…" : "開始製作字幕"}
                  <span className="rounded-full bg-[var(--accent-2)] px-2 py-0.5 text-xs font-bold text-[#0a0a0a]">
                    {asr.owner ? "不扣" : `+ ${cost}`}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold">拖放音檔或影片檔到這裡</p>
              <p className="mt-2 text-[var(--muted)]">
                或從裝置選擇檔案，上傳後會自動生成逐字稿
              </p>
              <button
                type="button"
                className="btn primary mt-8 px-8 py-2 text-base"
                onClick={() => fileRef.current?.click()}
              >
                選擇檔案
              </button>
            </>
          )}
          <p className="mt-6 text-xs leading-6 text-[var(--muted)]">
            影片、音檔都能選，最長 40 分鐘。片子留在你的電腦，只送出聲音做聽打。
            <br />
            人聲乾淨、沒有配樂最準。人名、品牌先加詞庫，再按開始製作。
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(event) => {
            pickFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </main>

      <footer className="flex items-center gap-3 px-5 py-3 text-xs text-[var(--muted)]">
        <span>已用 {used}{asr.owner ? "" : ` · 本期共 ${PUBLIC_DAILY}`}</span>
        <span className="ml-auto">TIP 先對好語言與版式再開始，安全框才會準。</span>
        <Link href="/" className="hover:text-[var(--text)]">
          說明
        </Link>
      </footer>
      <Link
        href="/studio"
        className="fixed right-5 bottom-6 rounded-full bg-[var(--accent-2)] px-4 py-2 text-sm font-bold text-[#0a0a0a]"
      >
        Subby
      </Link>
      {toast ? (
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function SettingsBar({
  language,
  layout,
  customWidth,
  customHeight,
  onLanguage,
  onLayout,
  onWidth,
  onHeight,
}: {
  language: AsrLanguage;
  layout: LayoutMode;
  customWidth: number;
  customHeight: number;
  onLanguage: (value: AsrLanguage) => void;
  onLayout: (value: LayoutMode) => void;
  onWidth: (value: number) => void;
  onHeight: (value: number) => void;
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          語言
          <select
            className="field rounded-full"
            value={language}
            onChange={(event) => onLanguage(event.target.value as AsrLanguage)}
          >
            {ASR_LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          版式
          <div className="flex overflow-hidden rounded-full border border-[var(--line)] bg-white">
            {LAYOUTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`px-3 py-1.5 ${layout === item.id ? "bg-[#111] text-white" : ""}`}
                onClick={() => onLayout(item.id)}
              >
                {layout === item.id ? "● " : ""}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {layout === "custom" ? (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="number"
            className="field w-24"
            value={customWidth}
            onChange={(event) => onWidth(Number(event.target.value) || 1920)}
          />
          ×
          <input
            type="number"
            className="field w-24"
            value={customHeight}
            onChange={(event) => onHeight(Number(event.target.value) || 1080)}
          />
        </div>
      ) : null}
    </>
  );
}
