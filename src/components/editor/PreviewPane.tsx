"use client";

import { formatPlayerTime } from "@/lib/time";
import { cueAtTime } from "@/lib/cues";
import { SAFE_FRAME, snapIntoSafe } from "@/lib/style";
import { useEditorStore } from "@/store/editor-store";
import { type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
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
  const durationMs = useEditorStore((s) => s.durationMs);
  const orientation = useEditorStore((s) => s.orientation);
  const showSafeFrame = useEditorStore((s) => s.showSafeFrame);
  const style = useEditorStore((s) => s.style);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectCue = useEditorStore((s) => s.selectCue);
  const patchStyle = useEditorStore((s) => s.patchStyle);
  const updateCueText = useEditorStore((s) => s.updateCueText);
  const layoutMode = useEditorStore((s) => s.layoutMode);
  const setOrientation = useEditorStore((s) => s.setOrientation);
  const showStyle = useEditorStore((s) => s.showStyle);
  const playbackRate = useEditorStore((s) => s.playbackRate);
  const volume = useEditorStore((s) => s.volume);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(
    null,
  );
  const playing = useEditorStore((s) => s.playing);
  const [stageW, setStageW] = useState(0);
  const [clockMs, setClockMs] = useState(currentTimeMs);
  const overlayMs = playing ? clockMs : currentTimeMs;
  const active = cueAtTime(cues, overlayMs);
  const shown = active;
  const frame = SAFE_FRAME[orientation];
  const fontPx = Math.max(16, (style.fontSize / 100) * (stageW || 360));
  const draftOrigin = useRef("");
  const born = shown ? Math.max(0, overlayMs - shown.startMs) : 0;
  const motionT = Math.min(1, born / 180);
  const overlayScale =
    style.animation === "zoom" ? 0.86 + 0.14 * motionT : style.animation === "pop" ? 1.12 - 0.12 * motionT : 1;
  const overlayAlpha = style.animation === "fade" ? motionT : 1;

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.playbackRate = playbackRate;
  }, [mediaRef, playbackRate]);

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.volume = volume;
  }, [mediaRef, volume]);

  useEffect(() => {
    const node = mediaRef.current;
    if (!node || !mediaUrl) return;
    let raf = 0;
    const push = () => {
      const ms = node.currentTime * 1000;
      setClockMs(ms);
      onTime(ms);
    };
    const tick = () => {
      push();
      if (!node.paused && !node.ended) raf = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      push();
    };
    node.addEventListener("play", start);
    node.addEventListener("pause", stop);
    node.addEventListener("seeked", push);
    node.addEventListener("loadedmetadata", push);
    if (!node.paused) start();
    else push();
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener("play", start);
      node.removeEventListener("pause", stop);
      node.removeEventListener("seeked", push);
      node.removeEventListener("loadedmetadata", push);
    };
  }, [mediaRef, mediaUrl, onTime]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageW(stage.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [mediaUrl]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!shown) return;
    event.preventDefault();
    event.stopPropagation();
    selectCue(shown.id);
    (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      x: style.x,
      y: style.y,
      px: event.clientX,
      py: event.clientY,
      moved: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    if (Math.hypot(event.clientX - drag.px, event.clientY - drag.py) > 5) drag.moved = true;
    if (!drag.moved) return;
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

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag && !drag.moved && shown) {
      mediaRef.current?.pause();
      selectCue(shown.id);
    }
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

  const overlayStyle = {
    left: `${style.x}%`,
    top: `${style.y}%`,
    transform: `translate(-50%, -50%) scale(${overlayScale})`,
    opacity: overlayAlpha,
    fontFamily: style.fontFamily,
    fontSize: `${fontPx}px`,
    color: style.color,
    WebkitTextStroke: playing ? `${Math.max(1, fontPx * 0.08)}px ${style.strokeColor}` : "0",
    textShadow: playing
      ? `0 0 ${Math.max(2, fontPx * 0.12)}px ${style.strokeColor}, 0 ${Math.max(1, fontPx * 0.06)}px ${Math.max(2, fontPx * 0.18)}px ${style.strokeColor}`
      : "none",
    paintOrder: "stroke fill" as const,
    outline: selectedId === shown?.id ? "1px solid var(--accent)" : "none",
  };

  return (
    <section className="flex h-full min-h-[280px] flex-col border-b border-[var(--line)] bg-[var(--bg)] lg:border-r lg:border-b-0">
      {showStyle ? <StyleBar /> : null}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {mediaUrl ? (
          <div ref={stageRef} className="relative inline-block max-h-full max-w-full overflow-hidden rounded-md bg-black">
            <video
              ref={mediaRef}
              src={mediaUrl}
              playsInline
              className="block max-h-[58vh] max-w-full"
              onTimeUpdate={(event) => onTime(event.currentTarget.currentTime * 1000)}
              onLoadedMetadata={(event) => {
                const node = event.currentTarget;
                onDuration(node.duration * 1000);
                if (layoutMode === "auto") {
                  setOrientation(node.videoWidth < node.videoHeight ? "vertical" : "horizontal");
                }
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
            {shown ? (
              <div
                className="absolute z-20 max-w-[86%] px-2 py-1 text-center leading-snug"
                style={overlayStyle}
                onClick={(event) => {
                  event.stopPropagation();
                  if (playing) mediaRef.current?.pause();
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {playing ? (
                  <KaraokeText
                    text={shown.text}
                    words={shown.words}
                    timeMs={overlayMs}
                    karaoke={style.karaoke}
                  />
                ) : (
                  <textarea
                    value={shown.text}
                    rows={2}
                    className="w-full min-w-[8rem] resize-none bg-black/35 text-center outline-none"
                    style={{
                      fontFamily: style.fontFamily,
                      fontSize: `${fontPx}px`,
                      color: style.color,
                      lineHeight: 1.3,
                    }}
                    onFocus={() => {
                      draftOrigin.current = shown.text;
                      selectCue(shown.id);
                      mediaRef.current?.pause();
                    }}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      if (shown.text === draftOrigin.current && next !== draftOrigin.current) {
                        useEditorStore.getState().recordHistory();
                      }
                      updateCueText(shown.id, next, false);
                    }}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                )}
                {style.bilingual && (shown.translation || !playing) ? (
                  playing ? (
                    <p
                      className="mt-1 text-center"
                      style={{ fontSize: `${Math.max(12, fontPx * 0.62)}px`, opacity: 0.92 }}
                    >
                      {shown.translation}
                    </p>
                  ) : (
                    <textarea
                      value={shown.translation ?? ""}
                      rows={1}
                      placeholder="譯文"
                      className="mt-1 w-full resize-none bg-black/20 text-center outline-none"
                      style={{
                        fontFamily: style.fontFamily,
                        fontSize: `${Math.max(12, fontPx * 0.62)}px`,
                        color: style.color,
                      }}
                      onChange={(event) =>
                        useEditorStore
                          .getState()
                          .updateCueTranslation(shown.id, event.currentTarget.value, false)
                      }
                    />
                  )
                ) : null}
                <button
                  type="button"
                  aria-label="拖動字幕位置"
                  className="absolute -left-3 top-1/2 h-7 w-3 -translate-y-1/2 cursor-grab rounded-full bg-[var(--accent)]"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                />
                <button
                  type="button"
                  aria-label="調整字級"
                  className="absolute -right-1 -bottom-1 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-black bg-[var(--accent)]"
                  onPointerDown={resizeFromCorner}
                />
              </div>
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 bg-gradient-to-t from-black/75 to-transparent px-2.5 py-2 text-xs text-white">
              <button
                type="button"
                className="pointer-events-auto flex h-6 w-6 items-center justify-center"
                onClick={() => {
                  const node = mediaRef.current;
                  if (!node) return;
                  if (node.paused) void node.play();
                  else node.pause();
                }}
                aria-label={playing ? "暫停" : "播放"}
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <span className="font-mono">
                {formatPlayerTime(overlayMs)} / {formatPlayerTime(durationMs)}
              </span>
            </div>
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
                className="mt-8 text-2xl text-white"
                style={{
                  fontFamily: style.fontFamily,
                  color: style.color,
                  WebkitTextStroke: `${Math.max(1, fontPx * 0.06)}px ${style.strokeColor}`,
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
