"use client";

import { currentCueIndex } from "@/lib/cues";
import { SAFE_FRAME, snapIntoSafe } from "@/lib/style";
import { useEditorStore } from "@/store/editor-store";
import { type PointerEvent, type RefObject, useEffect, useRef } from "react";
import { StyleBar } from "./StyleBar";

type Props = {
  mediaRef: RefObject<HTMLVideoElement | null>;
  onTime: (ms: number) => void;
  onDuration: (ms: number) => void;
};

export function PreviewPane({ mediaRef, onTime, onDuration }: Props) {
  const mediaUrl = useEditorStore((s) => s.mediaUrl);
  const mediaName = useEditorStore((s) => s.mediaName);
  const cues = useEditorStore((s) => s.cues);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const orientation = useEditorStore((s) => s.orientation);
  const showSafeFrame = useEditorStore((s) => s.showSafeFrame);
  const style = useEditorStore((s) => s.style);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectCue = useEditorStore((s) => s.selectCue);
  const patchStyle = useEditorStore((s) => s.patchStyle);
  const setOrientation = useEditorStore((s) => s.setOrientation);
  const showStyle = useEditorStore((s) => s.showStyle);
  const playbackRate = useEditorStore((s) => s.playbackRate);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const active = cues[currentCueIndex(cues, currentTimeMs)];
  const frame = SAFE_FRAME[orientation];

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.playbackRate = playbackRate;
  }, [mediaRef, playbackRate]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!active) return;
    event.preventDefault();
    selectCue(active.id);
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    dragRef.current = { x: style.x, y: style.y, px: event.clientX, py: event.clientY };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const nx = drag.x + ((event.clientX - drag.px) / rect.width) * 100;
    const ny = drag.y + ((event.clientY - drag.py) / rect.height) * 100;
    const snapped = snapIntoSafe(
      Math.min(92, Math.max(8, nx)),
      Math.min(94, Math.max(8, ny)),
      orientation,
    );
    patchStyle(snapped);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeFromCorner(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const startSize = style.fontSize;
    const move = (ev: PointerEvent | globalThis.PointerEvent) => {
      patchStyle({
        fontSize: Math.min(10, Math.max(2.4, startSize + (ev.clientX - startX) / 28)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <section className="flex min-h-[280px] flex-col border-b border-[var(--line)] bg-[#111] lg:border-r lg:border-b-0">
      {showStyle ? <StyleBar /> : null}
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-3">
        {mediaUrl ? (
          <div
            ref={stageRef}
            className="relative inline-block max-h-full max-w-full"
            style={{ containerType: "size" }}
          >
            <video
              ref={mediaRef}
              src={mediaUrl}
              className="block max-h-[58vh] max-w-full"
              onTimeUpdate={(event) => onTime(event.currentTarget.currentTime * 1000)}
              onLoadedMetadata={(event) => {
                const node = event.currentTarget;
                onDuration(node.duration * 1000);
                setOrientation(node.videoWidth < node.videoHeight ? "vertical" : "horizontal");
              }}
              onPlay={() => {
                if (mediaRef.current) mediaRef.current.playbackRate = playbackRate;
                useEditorStore.getState().setPlaying(true);
              }}
              onPause={() => useEditorStore.getState().setPlaying(false)}
              onClick={() => {
                const node = mediaRef.current;
                if (!node) return;
                if (node.paused) void node.play();
                else node.pause();
              }}
            />
            {showSafeFrame ? (
              <div className="pointer-events-none absolute inset-0 z-10">
                <div
                  className="absolute rounded-md border border-dashed border-[var(--accent-2)]/80"
                  style={{
                    left: `${frame.l}%`,
                    top: `${frame.t}%`,
                    right: `${frame.r}%`,
                    bottom: `${frame.b}%`,
                  }}
                >
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent-2)] px-2 py-0.5 text-[10px] font-semibold text-[#102226]">
                    字幕安全區
                  </span>
                </div>
              </div>
            ) : null}
            {active?.text ? (
              <div
                className="absolute z-20 max-w-[86%] cursor-grab touch-none select-none px-2 py-1 text-center leading-snug"
                style={{
                  left: `${style.x}%`,
                  top: `${style.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: style.fontFamily,
                  fontSize: `${style.fontSize}cqw`,
                  color: style.color,
                  WebkitTextStroke: `${style.strokeWidth}px ${style.strokeColor}`,
                  paintOrder: "stroke fill",
                  outline:
                    selectedId === active.id ? "1px solid var(--accent)" : "none",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <KaraokeText
                  text={active.text}
                  words={active.words}
                  timeMs={currentTimeMs}
                  karaoke={style.karaoke}
                />
                <button
                  type="button"
                  aria-label="調整字級"
                  className="absolute -right-1 -bottom-1 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-black bg-[var(--accent)]"
                  onPointerDown={resizeFromCorner}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="px-8 text-center text-[var(--muted)]">
            <p className="text-lg text-[var(--text)]">還沒有影片</p>
            <p className="mt-2 text-sm">
              波形與改字不用片子也能做。要對位置、安全框、輸出成品，再把影片接回來。
            </p>
            {mediaName ? <p className="mt-3 text-xs">{mediaName}</p> : null}
            {active?.text ? (
              <p
                className="mt-8 text-2xl"
                style={{
                  fontFamily: style.fontFamily,
                  color: style.color,
                  WebkitTextStroke: `${style.strokeWidth}px ${style.strokeColor}`,
                  paintOrder: "stroke fill",
                }}
              >
                {active.text}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function KaraokeText({
  text,
  words,
  timeMs,
  karaoke,
}: {
  text: string;
  words: { text: string; startMs: number; endMs: number }[];
  timeMs: number;
  karaoke: boolean;
}) {
  if (!karaoke || words.length === 0) return <>{text}</>;
  return (
    <>
      {words.map((word, index) => (
        <span
          key={`${word.startMs}-${index}`}
          style={{ opacity: timeMs >= word.startMs ? 1 : 0.38 }}
        >
          {word.text}
        </span>
      ))}
    </>
  );
}
