"use client";

import { publishHero } from "@/lib/heroes";
import { FONTS, type StyleAnimation } from "@/lib/style";
import { STYLE_PRESETS } from "@/lib/style-presets";
import { useEditorStore } from "@/store/editor-store";

const MOTIONS: { id: StyleAnimation; label: string }[] = [
  { id: "none", label: "無動畫" },
  { id: "fade", label: "淡入" },
  { id: "zoom", label: "縮放" },
  { id: "pop", label: "彈入" },
];

export function StyleBar() {
  const name = useEditorStore((s) => s.name);
  const orientation = useEditorStore((s) => s.orientation);
  const showSafeFrame = useEditorStore((s) => s.showSafeFrame);
  const style = useEditorStore((s) => s.style);
  const setOrientation = useEditorStore((s) => s.setOrientation);
  const setShowSafeFrame = useEditorStore((s) => s.setShowSafeFrame);
  const patchStyle = useEditorStore((s) => s.patchStyle);
  const applyStyle = useEditorStore((s) => s.applyStyle);
  const setToast = useEditorStore((s) => s.setToast);

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
      <button
        type="button"
        className={`btn ${style.bilingual ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
        onClick={() => patchStyle({ bilingual: !style.bilingual })}
      >
        雙語
      </button>
      <select
        className="field"
        value=""
        onChange={(event) => {
          const preset = STYLE_PRESETS.find((item) => item.id === event.target.value);
          if (!preset) return;
          applyStyle(preset.style, preset.orientation);
          setToast(`已套用「${preset.name}」`);
        }}
      >
        <option value="">樣式預設</option>
        {STYLE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
      <select
        className="field"
        value={style.animation}
        onChange={(event) => patchStyle({ animation: event.target.value as StyleAnimation })}
      >
        {MOTIONS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
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
      <button
        type="button"
        className="btn"
        onClick={() => {
          publishHero({
            id: `mine-${Date.now()}`,
            name: `${name || "未命名"} 樣式`,
            author: "我",
            orientation,
            style,
          });
          setToast("已發到本機英雄榜");
        }}
      >
        發到英雄榜
      </button>
      <span className="text-[var(--muted)]">拖左側握把對位置，拉右下角改字級</span>
    </div>
  );
}
