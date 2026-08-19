"use client";

import { detectSceneCuts } from "@/lib/cuts";
import { cueAtTime } from "@/lib/cues";
import { clamp, snapMs, snapTargets } from "@/lib/snap";
import { formatPlayerTime } from "@/lib/time";
import type { SeekOpts } from "@/lib/types";
import { drawWaveform } from "@/lib/waveform";
import { useEditorStore } from "@/store/editor-store";
import { type RefObject, useEffect, useRef, useState } from "react";

type Props = {
  onSeek: (ms: number, opts?: SeekOpts) => void;
  mediaRef: RefObject<HTMLVideoElement | null>;
};

type Drag =
  | { kind: "move"; id: string; start: number; end: number; originMs: number; originX: number }
  | { kind: "resize"; id: string; edge: "start" | "end"; start: number; end: number }
  | { kind: "create"; originMs: number }
  | { kind: "pan"; originX: number; originView: number };

const MIN_CUE_MS = 80;

export function Timeline({ onSeek, mediaRef }: Props) {
  const cues = useEditorStore((s) => s.cues);
  const durationMs = useEditorStore((s) => s.durationMs);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const selectedId = useEditorStore((s) => s.selectedId);
  const peaks = useEditorStore((s) => s.peaks);
  const marks = useEditorStore((s) => s.marks);
  const cutPoints = useEditorStore((s) => s.cutPoints);
  const viewStartMs = useEditorStore((s) => s.viewStartMs);
  const viewDurationMs = useEditorStore((s) => s.viewDurationMs);
  const playing = useEditorStore((s) => s.playing);
  const mediaUrl = useEditorStore((s) => s.mediaUrl);
  const cutDetectProgress = useEditorStore((s) => s.cutDetectProgress);
  const selectCue = useEditorStore((s) => s.selectCue);
  const addCueAt = useEditorStore((s) => s.addCueAt);
  const toggleMark = useEditorStore((s) => s.toggleMark);
  const setView = useEditorStore((s) => s.setView);
  const setCutPoints = useEditorStore((s) => s.setCutPoints);
  const setCutDetectProgress = useEditorStore((s) => s.setCutDetectProgress);
  const setToast = useEditorStore((s) => s.setToast);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const recordHistory = useEditorStore((s) => s.recordHistory);
  const volume = useEditorStore((s) => s.volume);
  const setVolume = useEditorStore((s) => s.setVolume);
  const playbackRate = useEditorStore((s) => s.playbackRate);
  const setPlaybackRate = useEditorStore((s) => s.setPlaybackRate);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setShowStyle = useEditorStore((s) => s.setShowStyle);
  const showStyle = useEditorStore((s) => s.showStyle);

  const trackRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [guideMs, setGuideMs] = useState<number | null>(null);
  const activeId = cueAtTime(cues, currentTimeMs)?.id;
  const total = Math.max(durationMs, 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wave = waveRef.current;
    if (!canvas || !wave) return;
    const color =
      getComputedStyle(document.documentElement).getPropertyValue("--wave").trim() ||
      "#2d8f45";
    const paint = () =>
      drawWaveform(canvas, peaks, viewStartMs, viewDurationMs, total, color);
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(wave);
    return () => observer.disconnect();
  }, [peaks, viewStartMs, viewDurationMs, total]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = track.getBoundingClientRect();
      const mouseTime = timeAt(event.clientX, rect, viewStartMs, viewDurationMs);
      const factor = event.deltaY > 0 ? 1.18 : 1 / 1.18;
      const nextDuration = viewDurationMs * factor;
      const ratio = (mouseTime - viewStartMs) / viewDurationMs;
      setView(mouseTime - ratio * nextDuration, nextDuration);
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, [viewStartMs, viewDurationMs, setView]);

  useEffect(() => {
    if (!playing) return;
    const viewEnd = viewStartMs + viewDurationMs;
    if (currentTimeMs < viewStartMs || currentTimeMs > viewEnd - viewDurationMs * 0.1) {
      setView(currentTimeMs - viewDurationMs * 0.2, viewDurationMs);
    }
  }, [currentTimeMs, playing, viewStartMs, viewDurationMs, setView]);

  function clientTime(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(timeAt(clientX, rect, viewStartMs, viewDurationMs), 0, total);
  }

  function thresholdMs() {
    const width = trackRef.current?.clientWidth ?? 1;
    return Math.max(40, (viewDurationMs / width) * 8);
  }

  function startDrag(next: Drag) {
    if (next.kind === "resize") recordHistory();
    dragRef.current = next;
    let moved = false;
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const time = (() => {
        const rect = trackRef.current?.getBoundingClientRect();
        const view = useEditorStore.getState();
        if (!rect) return 0;
        return clamp(timeAt(event.clientX, rect, view.viewStartMs, view.viewDurationMs), 0, view.durationMs || 1);
      })();
      const snapAt = thresholdMs();
      const state = useEditorStore.getState();
      if (drag.kind === "pan") {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        const delta = ((drag.originX - event.clientX) / rect.width) * state.viewDurationMs;
        state.setView(drag.originView + delta, state.viewDurationMs);
        return;
      }
      if (drag.kind === "create") {
        const start = Math.min(drag.originMs, time);
        const end = Math.max(drag.originMs, time);
        setDraft({ start, end });
        return;
      }
      if (drag.kind === "move" && !moved) {
        if (Math.abs(event.clientX - drag.originX) < 5) return;
        moved = true;
        recordHistory();
      }
      const otherTargets = snapTargets({
        durationMs: state.durationMs || 1,
        marks: state.marks,
        cutPoints: state.cutPoints,
        cues: state.cues,
        exceptId: drag.id,
      });
      if (drag.kind === "move") {
        const span = drag.end - drag.start;
        const raw = drag.start + (time - drag.originMs);
        const snapped = snapMs(raw, otherTargets, snapAt);
        let start = snapped.value;
        let end = start + span;
        if (start < 0) {
          start = 0;
          end = span;
        }
        if (end > (state.durationMs || span)) {
          end = state.durationMs;
          start = Math.max(0, state.durationMs - span);
        }
        state.setCueTiming(drag.id, start, end);
        setGuideMs(snapped.snapped ? start : null);
        return;
      }
      const snapped = snapMs(time, otherTargets, snapAt);
      if (drag.edge === "start") {
        state.setCueTiming(drag.id, Math.min(snapped.value, drag.end - MIN_CUE_MS), drag.end);
      } else {
        state.setCueTiming(drag.id, drag.start, Math.max(snapped.value, drag.start + MIN_CUE_MS));
      }
      setGuideMs(snapped.snapped ? snapped.value : null);
    };
    const onUp = (event: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const drag = dragRef.current;
      dragRef.current = null;
      setGuideMs(null);
      if (drag?.kind === "move" && !moved) {
        onSeek(drag.originMs, { play: true });
        return;
      }
      if (drag?.kind === "create") {
        const time = clientTime(event.clientX);
        if (Math.abs(time - drag.originMs) < 40) {
          onSeek(drag.originMs, { play: true });
          setDraft(null);
          return;
        }
        const start = Math.min(drag.originMs, time);
        const end = Math.max(drag.originMs, time);
        addCueAt(start, Math.max(start + MIN_CUE_MS, end));
        setDraft(null);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function runCutDetect() {
    if (!mediaUrl) {
      setToast("請先上傳有畫面的影片");
      return;
    }
    if (cutDetectProgress != null) return;
    setCutDetectProgress(0);
    try {
      const points = await detectSceneCuts(mediaUrl, total, (progress) =>
        setCutDetectProgress(progress),
      );
      setCutPoints(points);
      setToast(points.length ? `找到 ${points.length} 個切點` : "沒有明顯切點");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "切點偵測失敗");
    } finally {
      setCutDetectProgress(null);
    }
  }

  const viewEnd = viewStartMs + viewDurationMs;
  const selected = cues.find((cue) => cue.id === selectedId);
  const zoomPct =
    total <= 1500
      ? 100
      : Math.round((1 - (viewDurationMs - 1500) / (total - 1500)) * 100);
  const ticks = rulerTicks(viewStartMs, viewDurationMs);

  return (
    <div className="border-b border-[var(--line)] bg-[var(--panel)] px-4 pt-2 pb-2">
      <div className="relative mb-1 h-5 text-[11px] text-[var(--muted)]">
        {ticks.map((ms) => (
          <span
            key={ms}
            className="absolute -translate-x-1/2 font-mono"
            style={{ left: `${((ms - viewStartMs) / viewDurationMs) * 100}%` }}
          >
            {formatRuler(ms)}
          </span>
        ))}
      </div>
      <div
        ref={trackRef}
        className="relative overflow-hidden rounded-md bg-[#f6f4ee]"
        onMouseDown={(event) => {
          if (event.button === 1 || event.altKey) {
            event.preventDefault();
            startDrag({
              kind: "pan",
              originX: event.clientX,
              originView: viewStartMs,
            });
            return;
          }
          if (event.button !== 0) return;
          const handle = (event.target as HTMLElement).dataset.handle;
          const cueId = (event.target as HTMLElement).dataset.cueBlock
            ?? (event.target as HTMLElement).closest("[data-cue-block]")?.getAttribute("data-cue-block");
          if (handle && cueId) {
            const cue = cues.find((item) => item.id === cueId);
            if (!cue) return;
            event.preventDefault();
            selectCue(cue.id);
            startDrag({
              kind: "resize",
              id: cue.id,
              edge: handle === "start" ? "start" : "end",
              start: cue.startMs,
              end: cue.endMs,
            });
            return;
          }
          if (cueId) {
            const cue = cues.find((item) => item.id === cueId);
            if (!cue) return;
            event.preventDefault();
            selectCue(cue.id);
            startDrag({
              kind: "move",
              id: cue.id,
              start: cue.startMs,
              end: cue.endMs,
              originMs: clientTime(event.clientX),
              originX: event.clientX,
            });
            return;
          }
          const lane = (event.target as HTMLElement).closest("[data-lane]")?.getAttribute("data-lane");
          if (lane === "wave") {
            startDrag({ kind: "create", originMs: clientTime(event.clientX) });
            return;
          }
          onSeek(clientTime(event.clientX));
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          toggleMark(clientTime(event.clientX));
        }}
        onMouseMove={(event) => {
          if (dragRef.current || playing) return;
          onSeek(clientTime(event.clientX));
        }}
      >
        <div ref={waveRef} data-lane="wave" className="relative h-[7.5rem] cursor-crosshair">
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          {cues
            .filter((cue) => cue.endMs >= viewStartMs && cue.startMs <= viewEnd)
            .map((cue) => {
              const left = ((cue.startMs - viewStartMs) / viewDurationMs) * 100;
              const width = ((cue.endMs - cue.startMs) / viewDurationMs) * 100;
              const isSelected = cue.id === selectedId;
              return (
                <div
                  key={`band-${cue.id}`}
                  className="pointer-events-none absolute top-0 z-[1] h-full"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.2)}%`,
                    background: isSelected ? "rgba(0, 0, 0, 0.08)" : "transparent",
                    boxShadow: "inset 1px 0 0 rgba(80,80,80,0.28), inset -1px 0 0 rgba(80,80,80,0.28)",
                  }}
                />
              );
            })}
          {cues
            .filter((cue) => cue.endMs >= viewStartMs && cue.startMs <= viewEnd)
            .map((cue) => (
              <div
                key={`edge-${cue.id}`}
                className="pointer-events-none absolute top-0 z-10 h-full w-px bg-black/25"
                style={{ left: `${((cue.startMs - viewStartMs) / viewDurationMs) * 100}%` }}
              />
            ))}
          {cues
            .filter((cue) => cue.endMs >= viewStartMs && cue.startMs <= viewEnd)
            .map((cue) => {
              const left = ((cue.startMs - viewStartMs) / viewDurationMs) * 100;
              const width = ((cue.endMs - cue.startMs) / viewDurationMs) * 100;
              const isSelected = cue.id === selectedId;
              const active = cue.id === activeId;
              return (
                <div
                  key={cue.id}
                  data-cue-block={cue.id}
                  title={cue.text || "（新字幕）"}
                  className="absolute top-1.5 z-20 h-[22px] overflow-hidden rounded-[3px] border border-black/10 bg-white text-left text-[11px] leading-[22px] whitespace-nowrap text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.35)}%`,
                    background: isSelected || active ? "#eceae3" : "#fff",
                  }}
                >
                  <span
                    data-handle="start"
                    className="absolute top-0 left-0 z-10 h-full w-1.5 cursor-ew-resize"
                  />
                  <span className="pointer-events-none px-1.5">{cue.text || "（新字幕）"}</span>
                  <span
                    data-handle="end"
                    className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-ew-resize"
                  />
                </div>
              );
            })}
          {cutPoints.map((ms) =>
            ms >= viewStartMs && ms <= viewEnd ? (
              <div
                key={`cut-${ms}`}
                className="pointer-events-none absolute top-0 z-10 h-full w-px bg-[var(--cut)]"
                style={{ left: `${((ms - viewStartMs) / viewDurationMs) * 100}%` }}
              >
                <span className="absolute top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--cut)]" />
              </div>
            ) : null,
          )}
          {marks.map((ms) =>
            ms >= viewStartMs && ms <= viewEnd ? (
              <button
                key={`mark-${ms}`}
                type="button"
                title="對齊點，再點一次可移除"
                className="absolute top-0 z-20 h-full w-3 -translate-x-1/2"
                style={{ left: `${((ms - viewStartMs) / viewDurationMs) * 100}%` }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSeek(ms, { play: true });
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  toggleMark(ms);
                }}
              >
                <span className="absolute top-0 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-8 border-x-transparent border-t-[var(--accent)]" />
              </button>
            ) : null,
          )}
          {draft ? (
            <div
              className="pointer-events-none absolute top-4 z-30 h-16 rounded-sm bg-[var(--accent-2)]/40"
              style={{
                left: `${((draft.start - viewStartMs) / viewDurationMs) * 100}%`,
                width: `${((draft.end - draft.start) / viewDurationMs) * 100}%`,
              }}
            />
          ) : null}
        </div>
        {guideMs != null ? (
          <div
            className="pointer-events-none absolute top-0 z-40 h-full w-px bg-[var(--accent)]"
            style={{ left: `${((guideMs - viewStartMs) / viewDurationMs) * 100}%` }}
          />
        ) : null}
        <div
          className="pointer-events-none absolute top-0 z-30 h-full w-px bg-[#0a0a0a]"
          style={{ left: `${((currentTimeMs - viewStartMs) / viewDurationMs) * 100}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--muted)]">
        {selected ? (
          <span className="text-[var(--text)]">
            語句 開始{" "}
            <span className="font-mono font-medium">{formatPlayerTime(selected.startMs, true)}</span>{" "}
            結束{" "}
            <span className="font-mono font-medium">{formatPlayerTime(selected.endMs, true)}</span>{" "}
            <span className="font-mono font-medium">
              {((selected.endMs - selected.startMs) / 1000).toFixed(3)} 秒
            </span>
          </span>
        ) : (
          <span>點波形上的字幕塊，這裡會顯示這句起迄</span>
        )}
        <button
          type="button"
          className="btn primary relative"
          onClick={() => {
            if (!splitAtPlayhead()) setToast("把播放頭放在字幕上，再切過當前");
          }}
        >
          切過當前
          <span className="ml-1 rounded-full bg-[#111] px-1.5 py-px text-[9px] font-bold text-[var(--accent-2)]">
            NEW
          </span>
        </button>
        <button
          type="button"
          className={`btn ${cutPoints.length ? "primary" : ""}`}
          onClick={runCutDetect}
        >
          {cutDetectProgress == null
            ? "切點偵測"
            : `分析中 ${Math.round(cutDetectProgress * 100)}%`}
        </button>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-2)] text-sm font-bold text-[#0a0a0a]"
          onClick={() => {
            const node = mediaRef.current;
            if (!node?.src) return;
            if (node.paused) void node.play();
            else node.pause();
          }}
          aria-label={playing ? "暫停" : "播放"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="font-mono text-[var(--text)]">
          {formatPlayerTime(currentTimeMs, true)} / {formatPlayerTime(durationMs)}
        </span>
        <select
          className="rounded-full border border-[var(--line)] bg-white px-2 py-1 text-xs"
          value={playbackRate}
          onChange={(event) => {
            const rate = Number(event.target.value);
            setPlaybackRate(rate);
            if (mediaRef.current) mediaRef.current.playbackRate = rate;
          }}
        >
          {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-full px-2 py-1 hover:bg-[var(--bg)] disabled:opacity-30"
          disabled={past.length === 0}
          onClick={undo}
        >
          復原
        </button>
        <button
          type="button"
          className="rounded-full px-2 py-1 hover:bg-[var(--bg)] disabled:opacity-30"
          disabled={future.length === 0}
          onClick={redo}
        >
          重做
        </button>
        <button
          type="button"
          className={`rounded-full px-2 py-1 hover:bg-[var(--bg)] ${showStyle ? "text-[var(--accent)]" : ""}`}
          onClick={() => setShowStyle(!showStyle)}
        >
          字幕樣式
        </button>
        <label className="ml-auto flex items-center gap-2">
          音量
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            className="w-20"
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
          />
        </label>
        <label className="flex items-center gap-2">
          縮放 {zoomPct}%
          <input
            type="range"
            min={0}
            max={100}
            value={zoomPct}
            className="w-28"
            onChange={(event) => {
              const pct = Number(event.target.value) / 100;
              const next = 1500 + (1 - pct) * Math.max(0, total - 1500);
              setView(currentTimeMs - next / 2, next);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function timeAt(
  clientX: number,
  rect: DOMRect,
  viewStartMs: number,
  viewDurationMs: number,
) {
  const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  return viewStartMs + ratio * viewDurationMs;
}

function rulerTicks(viewStartMs: number, viewDurationMs: number) {
  const step =
    viewDurationMs > 60_000
      ? 10_000
      : viewDurationMs > 20_000
        ? 5_000
        : viewDurationMs > 8_000
          ? 2_000
          : 1_000;
  const first = Math.ceil(viewStartMs / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= viewStartMs + viewDurationMs; t += step) ticks.push(t);
  return ticks;
}

function formatRuler(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
