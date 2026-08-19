"use client";

import { PUBLIC_DAILY } from "@/lib/access";
import {
  deleteProject,
  fromNow,
  listProjects,
  projectStats,
  type ProjectRecord,
} from "@/lib/projects";
import { clearPendingUpload } from "@/lib/pending-upload";
import { formatDuration } from "@/lib/time";
import type { AsrStatus } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ProjectHome() {
  const router = useRouter();
  const asr = useEditorStore((s) => s.asr);
  const setAsr = useEditorStore((s) => s.setAsr);
  const setToast = useEditorStore((s) => s.setToast);
  const toast = useEditorStore((s) => s.toast);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [subbyOpen, setSubbyOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setProjects(listProjects());
    refresh();
    window.addEventListener("ziju-projects", refresh);
    return () => window.removeEventListener("ziju-projects", refresh);
  }, []);

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

  function newProject() {
    router.push("/studio/new");
  }

  function removeProject(project: ProjectRecord) {
    if (!window.confirm(`確定刪除「${project.name}」？這台電腦上的字幕會拿掉。`)) return;
    deleteProject(project.id);
    clearPendingUpload(project.id);
    setToast(`已刪除 ${project.name}`);
  }

  const shown = projects.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-14 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4">
        <Link href="/studio" className="text-lg font-semibold tracking-tight">
          字句
        </Link>
        <label className="relative max-w-xs flex-1">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--muted)]">
            <SearchIcon />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋專案名稱"
            className="field w-full rounded-full pl-8"
          />
        </label>
        <button type="button" className="btn primary" onClick={newProject}>
          + 新專案
        </button>
        <Link href="/studio/clips" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          我的剪輯與字幕
        </Link>
        <Link href="/studio/heroes" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          英雄榜
        </Link>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">{asr.owner ? "主人" : "訪客"}</span>
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--accent-2)] px-1.5 text-xs font-bold text-[#0a0a0a]">
            {asr.owner ? "不限" : (asr.remaining ?? PUBLIC_DAILY)}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">我的專案</h1>
          <div className="flex overflow-hidden rounded-lg border border-[var(--line)] text-sm">
            <button
              type="button"
              className={`px-3 py-1.5 ${view === "grid" ? "bg-[#111] text-white" : "bg-white"}`}
              onClick={() => setView("grid")}
            >
              圖像
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 ${view === "list" ? "bg-[#111] text-white" : "bg-white"}`}
              onClick={() => setView("list")}
            >
              列表
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel)] px-8 py-16 text-center">
            <p className="text-lg">還沒有專案</p>
            <p className="mt-2 text-sm text-[var(--muted)]">按「新專案」開始聽打與改字。</p>
            <button type="button" className="btn primary mt-6" onClick={newProject}>
              + 新專案
            </button>
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={() => removeProject(project)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {shown.map((project) => {
              const stats = projectStats(project);
              return (
                <div
                  key={project.id}
                  className="flex items-center gap-4 border-b border-[var(--line)] px-4 py-3 last:border-b-0 hover:bg-[#f3f1ea]"
                >
                  <Link href={`/studio/${project.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <span className="w-16 font-mono text-xs text-[var(--muted)]">
                      {formatDuration(project.durationMs)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {stats.done
                        ? `${stats.cues} 句 · ${stats.chars.toLocaleString("zh-Hant")} 字`
                        : "聽打未完成"}
                    </span>
                    <span className="text-xs text-[var(--muted)]">更新於 {fromNow(project.updatedAt)}</span>
                  </Link>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                    onClick={() => removeProject(project)}
                  >
                    刪除
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="flex items-center gap-3 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--muted)]">
        <span>已自動儲存在這台電腦</span>
        <span className="ml-auto">
          TIP 專案先存在瀏覽器。換電腦或清資料要重新匯入字幕。
        </span>
        <Link href="/" className="hover:text-[var(--text)]">
          說明
        </Link>
      </footer>

      <button
        type="button"
        className="fixed right-5 bottom-14 z-30 rounded-full bg-[var(--accent-2)] px-4 py-2 text-sm font-bold text-[#0a0a0a]"
        onClick={() => setSubbyOpen((v) => !v)}
      >
        Subby
      </button>
      {subbyOpen ? (
        <div className="fixed right-5 bottom-28 z-30 w-64 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
          <p className="font-medium">Subby</p>
          <p className="mt-2 text-[var(--muted)]">客服還沒收進來。有問題直接在編輯器裡改，或回首頁看目前做到哪。</p>
          <button type="button" className="btn mt-3" onClick={() => setSubbyOpen(false)}>
            關閉
          </button>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--muted)]">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ProjectCard({
  project,
  onDelete,
}: {
  project: ProjectRecord;
  onDelete: () => void;
}) {
  const stats = projectStats(project);
  const first = project.cues[0]?.text ?? "還沒有字幕";
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
      <Link href={`/studio/${project.id}`} className="block">
        <div className="relative aspect-video bg-[#1a1a1a]">
          {project.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-lg text-white/90">
              {first}
            </p>
          )}
          <span className="absolute top-2 left-2 rounded-full bg-[var(--accent-2)] px-2 py-0.5 text-[11px] font-semibold text-[#0a0a0a]">
            ● {stats.done ? "完成" : "草稿"}
          </span>
          <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {formatDuration(project.durationMs)}
          </span>
        </div>
      </Link>
      <div className="px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/studio/${project.id}`} className="min-w-0 flex-1">
            <p className="truncate font-medium">{project.name}</p>
          </Link>
          <button
            type="button"
            className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--text)]"
            onClick={onDelete}
          >
            刪除
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">繁體中文</p>
        <p className="text-xs text-[var(--muted)]">
          {stats.done
            ? `${stats.chars.toLocaleString("zh-Hant")} 字 · ${stats.cues} 句 · ${stats.cpm} 字/分`
            : "聽打未完成，請打開專案再聽打一次"}
        </p>
        <p className="text-xs text-[var(--muted)]">更新於 {fromNow(project.updatedAt)}</p>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
