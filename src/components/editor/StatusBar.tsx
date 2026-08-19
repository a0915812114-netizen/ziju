"use client";

import { useEditorStore } from "@/store/editor-store";

type Props = {
  onSeek: (ms: number) => void;
};

export function StatusBar({ onSeek }: Props) {
  const cues = useEditorStore((s) => s.cues);
  const job = useEditorStore((s) => s.job);
  const selectRelative = useEditorStore((s) => s.selectRelative);

  return (
    <footer className="flex h-9 items-center gap-3 border-t border-[var(--line)] bg-[var(--panel)] px-4 text-xs text-[var(--muted)]">
      <span>{job.phase === "ready" ? "已暫存在這台電腦" : job.message || "字句"}</span>
      <span>{cues.length} 句</span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const id = selectRelative(-1);
            const cue = useEditorStore.getState().cues.find((item) => item.id === id);
            if (cue) onSeek(cue.startMs);
          }}
        >
          上一句
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const id = selectRelative(1);
            const cue = useEditorStore.getState().cues.find((item) => item.id === id);
            if (cue) onSeek(cue.startMs);
          }}
        >
          下一句
        </button>
      </div>
    </footer>
  );
}
