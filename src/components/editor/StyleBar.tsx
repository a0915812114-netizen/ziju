"use client";

import { FONTS } from "@/lib/style";
import { useEditorStore } from "@/store/editor-store";

export function StyleBar() {
  const orientation = useEditorStore((s) => s.orientation);
  const showSafeFrame = useEditorStore((s) => s.showSafeFrame);
  const style = useEditorStore((s) => s.style);
  const setOrientation = useEditorStore((s) => s.setOrientation);
  const setShowSafeFrame = useEditorStore((s) => s.setShowSafeFrame);
  const patchStyle = useEditorStore((s) => s.patchStyle);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs">
      <button
        type="button"
        className={`btn ${orientation === "horizontal" ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
        onClick={() => setOrientation("horizontal")}
      >
        橫式
      </button>
      <button
        type="button"
        className={`btn ${orientation === "vertical" ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
        onClick={() => setOrientation("vertical")}
      >
        直式
      </button>
      <button
        type="button"
        className={`btn ${showSafeFrame ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
        onClick={() => setShowSafeFrame(!showSafeFrame)}
      >
        安全框
      </button>
      <button
        type="button"
        className={`btn ${style.karaoke ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
        onClick={() => patchStyle({ karaoke: !style.karaoke })}
      >
        動態字幕
      </button>
      <select
        className="field"
        value={style.fontFamily}
        onChange={(event) => patchStyle({ fontFamily: event.target.value })}
      >
        {FONTS.map((font) => (
          <option key={font.id} value={font.id}>
            {font.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-[var(--muted)]">
        字色
        <input
          type="color"
          value={style.color}
          onChange={(event) => patchStyle({ color: event.target.value })}
        />
      </label>
      <label className="flex items-center gap-1 text-[var(--muted)]">
        描邊
        <input
          type="color"
          value={style.strokeColor}
          onChange={(event) => patchStyle({ strokeColor: event.target.value })}
        />
      </label>
      <span className="text-[var(--muted)]">拖字幕對位置，拉右下角改字級</span>
    </div>
  );
}
