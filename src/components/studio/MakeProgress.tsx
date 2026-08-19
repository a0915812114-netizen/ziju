"use client";

import { useMakeStore, type MakeStep } from "@/store/make-store";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const STEPS: { id: MakeStep; label: string }[] = [
  { id: "upload", label: "上傳聲音…" },
  { id: "transcribe", label: "工讀生聽打中" },
  { id: "split", label: "工讀生斷句調節" },
  { id: "save", label: "收尾存檔" },
];

export function MakeProgress() {
  const router = useRouter();
  const pathname = usePathname();
  const running = useMakeStore((s) => s.running);
  const minimized = useMakeStore((s) => s.minimized);
  const done = useMakeStore((s) => s.done);
  const fileName = useMakeStore((s) => s.fileName);
  const projectId = useMakeStore((s) => s.projectId);
  const step = useMakeStore((s) => s.step);
  const stepProgress = useMakeStore((s) => s.stepProgress);
  const startedAt = useMakeStore((s) => s.startedAt);
  const elapsedMs = useMakeStore((s) => s.elapsedMs);
  const cueCount = useMakeStore((s) => s.cueCount);
  const error = useMakeStore((s) => s.error);
  const cancel = useMakeStore((s) => s.cancel);
  const minimize = useMakeStore((s) => s.minimize);
  const restore = useMakeStore((s) => s.restore);
  const dismiss = useMakeStore((s) => s.dismiss);
  const prevPath = useRef(pathname);
  const [now, setNow] = useState(Date.now());
  const bars = useMemo(
    () => Array.from({ length: 48 }, () => 20 + Math.random() * 80),
    [startedAt],
  );

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    if (running && pathname !== "/studio/new") minimize();
  }, [pathname, running, minimize]);

  const elapsed = formatElapsed(running ? now - startedAt : elapsedMs);
  const currentIndex = STEPS.findIndex((item) => item.id === step);
  const overall = done
    ? 1
    : currentIndex < 0
      ? 0
      : (currentIndex + Math.min(1, stepProgress)) / STEPS.length;
  const showModal = ((running && !done) || Boolean(error) || done) && !minimized;
  const showFab = (running && minimized) || done;

  if (!showModal && !showFab) return null;

  function goEdit() {
    if (!projectId) return;
    dismiss();
    router.push(`/studio/${projectId}`);
  }

  function goHome() {
    dismiss();
    router.push("/studio");
  }

  return (
    <>
      {showModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f7f6f2]/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-sm">
            {done ? (
              <DoneBody
                bars={bars}
                cueCount={cueCount}
                elapsedMs={elapsedMs}
                onEdit={goEdit}
                onHome={goHome}
              />
            ) : (
              <ProgressBody
                bars={bars}
                currentIndex={currentIndex}
                elapsed={elapsed}
                error={error}
                fileName={fileName}
                overall={overall}
                running={running}
                step={step}
                stepProgress={stepProgress}
                onCancel={cancel}
                onDismiss={dismiss}
              />
            )}
          </div>
        </div>
      ) : null}
      {showFab ? (
        <button
          type="button"
          className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm shadow-sm"
          onClick={() => {
            if (minimized) restore();
          }}
        >
          {done ? (
            <>
              <CheckIcon />
              已完成
            </>
          ) : (
            <>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent-2)]" />
              製作中
            </>
          )}
        </button>
      ) : null}
    </>
  );
}

function ProgressBody({
  bars,
  currentIndex,
  elapsed,
  error,
  fileName,
  overall,
  running,
  step,
  stepProgress,
  onCancel,
  onDismiss,
}: {
  bars: number[];
  currentIndex: number;
  elapsed: string;
  error: string | null;
  fileName: string;
  overall: number;
  running: boolean;
  step: MakeStep;
  stepProgress: number;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${error ? "bg-[#111] text-white" : "bg-[var(--accent-2)] text-[#0a0a0a]"}`}
        >
          {error ? "失敗" : "製作中 · IN PROGRESS"}
        </span>
        <span className="ml-auto font-mono text-sm text-[var(--muted)]">已過 {elapsed}</span>
      </div>
      <h2 className="mt-4 text-xl font-semibold">字幕製作中</h2>
      <p className="mt-1 truncate text-sm text-[var(--muted)]">{fileName}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        可以先去逛別頁——左下角看得到進度，做完自動存進專案
      </p>
      <Waveform bars={bars} overall={overall} />
      <ol className="mt-5 space-y-1 text-sm">
        {STEPS.map((item, index) => {
          const active = item.id === step && running;
          const doneStep =
            index < currentIndex || (item.id === step && stepProgress >= 1 && !active);
          return (
            <li
              key={item.id}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 ${active ? "bg-[var(--accent-2)]/30" : ""}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${doneStep || active ? "bg-[var(--accent-2)]" : "border border-[var(--line)] bg-transparent"}`}
              />
              <span className="flex-1">{item.label}</span>
              {active ? (
                <span className="font-mono text-xs">{Math.round(stepProgress * 100)}%</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {error ? <p className="mt-4 text-sm text-[var(--accent)]">{error}</p> : null}
      <div className="mt-5 flex items-center gap-2 text-xs text-[var(--muted)]">
        <LockIcon />
        <span>只上傳聲音，比發送影片小很多</span>
        <div className="ml-auto flex gap-2">
          {running ? (
            <button type="button" className="btn" onClick={onCancel}>
              取消
            </button>
          ) : (
            <button type="button" className="btn" onClick={onDismiss}>
              關閉
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function DoneBody({
  bars,
  cueCount,
  elapsedMs,
  onEdit,
  onHome,
}: {
  bars: number[];
  cueCount: number;
  elapsedMs: number;
  onEdit: () => void;
  onHome: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-2)]" />
        <span className="font-medium">完成 · DONE</span>
      </div>
      <h2 className="mt-4 text-2xl font-semibold">字幕好了</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">已經存進專案，隨時可以開始編輯</p>
      <Waveform bars={bars} overall={1} />
      <p className="mt-4 text-sm text-[var(--muted)]">
        共 {cueCount} 句 · 耗時 {formatSpent(elapsedMs)} · 已存進專案
      </p>
      <button
        type="button"
        className="btn primary mt-6 flex w-full items-center justify-center gap-2 py-2.5 text-base"
        onClick={onEdit}
      >
        <PencilIcon />
        開始編輯
      </button>
      <button type="button" className="btn mt-3 w-full py-2.5" onClick={onHome}>
        回我的專案
      </button>
    </>
  );
}

function Waveform({ bars, overall }: { bars: number[]; overall: number }) {
  return (
    <div className="relative mt-5 flex h-16 items-end gap-0.5 overflow-hidden rounded-xl bg-[#efece4] px-2 py-2">
      {bars.map((height, index) => {
        const filled = index / bars.length < overall;
        return (
          <span
            key={index}
            className={`flex-1 rounded-sm ${filled ? "bg-[var(--accent-2)]" : "bg-[#d8d4c8]"}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSpent(ms: number) {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12.5 7 17 11.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.5 11 15.5 16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
