"use client";

import { formatClock } from "@/lib/time";
import { useEditorStore } from "@/store/editor-store";
import { type RefObject, useRef } from "react";

const RATES = [0.75, 1, 1.25, 1.5, 2];

type Props = {
  mediaRef: RefObject<HTMLVideoElement | null>;
};

export function TransportBar({ mediaRef }: Props) {
  const srtRef = useRef<HTMLInputElement>(null);
  const playing = useEditorStore((s) => s.playing);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const durationMs = useEditorStore((s) => s.durationMs);
  const playbackRate = useEditorStore((s) => s.playbackRate);
  const showStyle = useEditorStore((s) => s.showStyle);
  const showShortcuts = useEditorStore((s) => s.showShortcuts);
  const setPlaybackRate = useEditorStore((s) => s.setPlaybackRate);
  const setShowStyle = useEditorStore((s) => s.setShowStyle);
  const setShowShortcuts = useEditorStore((s) => s.setShowShortcuts);
  const importSrt = useEditorStore((s) => s.importSrt);
  const setToast = useEditorStore((s) => s.setToast);

  function togglePlay() {
    const node = mediaRef.current;
    if (!node?.src) return;
    if (node.paused) void node.play();
    else node.pause();
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2">
      <button type="button" className="btn primary min-w-10" onClick={togglePlay}>
        {playing ? "暫停" : "播放"}
      </button>
      <span className="font-mono text-sm">
        {formatClock(currentTimeMs)} / {formatClock(durationMs)}
      </span>
      <select
        className="field w-16"
        value={playbackRate}
        onChange={(event) => {
          const rate = Number(event.target.value);
          setPlaybackRate(rate);
          if (mediaRef.current) mediaRef.current.playbackRate = rate;
        }}
      >
        {RATES.map((rate) => (
          <option key={rate} value={rate}>
            {rate}x
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`btn ${showStyle ? "active" : ""}`}
        onClick={() => setShowStyle(!showStyle)}
      >
        字幕樣式
      </button>
      <button type="button" className="btn" onClick={() => srtRef.current?.click()}>
        匯入修正字幕
      </button>
      <button
        type="button"
        className={`btn ${showShortcuts ? "active" : ""}`}
        onClick={() => setShowShortcuts(!showShortcuts)}
      >
        快捷鍵
      </button>
      <input
        ref={srtRef}
        type="file"
        accept=".srt,.vtt,text/plain"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const count = importSrt(await file.text());
          setToast(count ? `已匯入 ${count} 句` : "讀不到字幕檔");
        }}
      />
      {showShortcuts ? (
        <div className="absolute top-full left-4 z-30 mt-1 w-80 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-xs leading-6 shadow-none">
          <p>空白鍵 播放／暫停</p>
          <p>B 在播放頭切斷　Delete 刪除這句</p>
          <p>Enter 斷句　行首 Backspace 合併　Alt 點字切斷</p>
          <p>↑ ↓ 上一句／下一句　M 對齊點</p>
          <p>波形：拖塊對時、拖空白新增、滾輪縮放、雙擊插旗</p>
          <p>匯出：SRT／VTT／逐字稿，或在瀏覽器燒成品影片</p>
        </div>
      ) : null}
    </div>
  );
}
