"use client";

import { detectSceneCuts } from "@/lib/cuts";
import { currentCueIndex } from "@/lib/cues";
import { clamp, snapMs, snapTargets } from "@/lib/snap";
import { formatPrecise } from "@/lib/time";
import { drawWaveform } from "@/lib/waveform";
import { useEditorStore } from "@/store/editor-store";
import { useEffect, useRef, useState } from "react";

type Props = {
  onSeek: (ms: number) => void;
};

type Drag =
  | { kind: "move"; id: string; start: number; end: number; originMs: number }
  | { kind: "resize"; id: string; edge: "start" | "end"; start: number; end: number }
  | { kind: "create"; originMs: number }
  | { kind: "pan"; originX: number; originView: number };

const MIN_CUE_MS = 80;

export function Timeline({ onSeek }: Props) {
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

  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [guideMs, setGuideMs] = useState<number | null>(null);
  const activeId = cues[currentCueIndex(cues, currentTimeMs)]?.id;
  const total = Math.max(durationMs, 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!canvas || !track) return;
    const color =
      getComputedStyle(document.documentElement).getPropertyValue("--wave").trim() ||
      "#2d8f45";
    const paint = () =>
      drawWaveform(canvas, peaks, viewStartMs, viewDurationMs, total, color);
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(track);
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
    dragRef.current = next;
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
      if (drag?.kind === "create") {
        const time = clientTime(event.clientX);
        if (Math.abs(time - drag.originMs) < 40) {
          onSeek(drag.originMs);
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
        className="relative h-36 cursor-crosshair overflow-hidden rounded-md bg-[#f3f1ea]"
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
            });
            return;
          }
          startDrag({ kind: "create", originMs: clientTime(event.clientX) });
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
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
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
                onSeek(ms);
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
        {cues
          .filter((cue) => cue.endMs >= viewStartMs && cue.startMs <= viewEnd)
          .map((cue) => {
            const left = ((cue.startMs - viewStartMs) / viewDurationMs) * 100;
            const width = ((cue.endMs - cue.startMs) / viewDurationMs) * 100;
            const selected = cue.id === selectedId;
            const active = cue.id === activeId;
            return (
              <div
                key={cue.id}
                data-cue-block={cue.id}
                title={cue.text || "（新字幕）"}
                className="absolute top-0 z-10 h-full overflow-hidden text-left text-[11px] leading-[9rem] whitespace-nowrap"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 0.35)}%`,
                  background: selected
                    ? "rgba(57, 255, 20, 0.42)"
                    : active
                      ? "rgba(31, 158, 75, 0.22)"
                      : "rgba(10, 10, 10, 0.10)",
                  color: "#0a0a0a",
                }}
              >
                <span
                  data-handle="start"
                  className="absolute top-0 left-0 z-10 h-full w-1.5 cursor-ew-resize bg-black/20"
                />
                <span className="pointer-events-none px-2">{cue.text || "（新字幕）"}</span>
                <span
                  data-handle="end"
                  className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-ew-resize bg-black/20"
                />
              </div>
            );
          })}
        {draft ? (
          <div
            className="pointer-events-none absolute top-10 z-30 h-16 rounded-sm bg-[var(--accent-2)]/40"
            style={{
              left: `${((draft.start - viewStartMs) / viewDurationMs) * 100}%`,
              width: `${((draft.end - draft.start) / viewDurationMs) * 100}%`,
            }}
          />
        ) : null}
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
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
        {selected ? (
          <span className="font-mono text-[var(--text)]">
            {formatPrecise(selected.startMs)} → {formatPrecise(selected.endMs)}
            <span className="ml-2 text-[var(--muted)]">
              {((selected.endMs - selected.startMs) / 1000).toFixed(3)} 秒
            </span>
          </span>
        ) : (
          <span>點一句字幕，這裡會顯示起迄毫秒</span>
        )}
        <button type="button" className="btn" onClick={runCutDetect}>
          {cutDetectProgress == null
            ? "切點偵測"
            : `分析中 ${Math.round(cutDetectProgress * 100)}%`}
        </button>
        <label className="ml-auto flex items-center gap-2">
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
