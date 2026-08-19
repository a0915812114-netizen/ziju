"use client";

import { applyPendingStyle, listHeroes } from "@/lib/heroes";
import type { StylePreset } from "@/lib/style-presets";
import { useEditorStore } from "@/store/editor-store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HeroesPage() {
  const router = useRouter();
  const setToast = useEditorStore((s) => s.setToast);
  const [heroes, setHeroes] = useState<StylePreset[]>([]);

  useEffect(() => {
    setHeroes(listHeroes());
  }, []);

  function apply(preset: StylePreset) {
    applyPendingStyle(preset.style, preset.orientation);
    setToast(`已記住「${preset.name}」。打開專案就會套上。`);
    router.push("/studio");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">英雄榜</h1>
          <p className="mt-2 max-w-xl text-[var(--muted)]">
            一鍵套用字幕樣式。先選一套，再打開專案。你自己發的樣式只存在這台電腦。
          </p>
        </div>
        <Link href="/studio" className="btn">
          回到我的專案
        </Link>
      </header>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {heroes.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-left hover:border-[var(--accent)]"
            onClick={() => apply(preset)}
          >
            <div
              className="flex h-24 items-center justify-center rounded-xl bg-[#111] px-3 text-center text-lg font-semibold"
              style={{
                fontFamily: preset.style.fontFamily,
                color: preset.style.color,
                textShadow: `0 0 6px ${preset.style.strokeColor}`,
              }}
            >
              字句字幕
            </div>
            <p className="mt-3 font-medium">{preset.name}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {preset.author} · {preset.orientation === "vertical" ? "直式" : "橫式"} ·{" "}
              {preset.style.animation === "none" ? "無動畫" : preset.style.animation}
              {preset.style.bilingual ? " · 雙語" : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
