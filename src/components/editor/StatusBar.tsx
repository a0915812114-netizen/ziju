"use client";

import Link from "next/link";
import type { SeekOpts } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";

type Props = {
  onSeek: (ms: number, opts?: SeekOpts) => void;
};

export function StatusBar({ onSeek }: Props) {
  const cues = useEditorStore((s) => s.cues);
  const job = useEditorStore((s) => s.job);
  const selectRelative = useEditorStore((s) => s.selectRelative);

  return (
    <footer className="flex h-9 items-center gap-3 border-t border-[var(--line)] bg-[var(--panel)] px-4 text-xs text-[var(--muted)]">
      <span>{cues.length} 句</span>
      {job.phase === "ready" ? <span>已自動儲存</span> : job.message ? <span>{job.message}</span> : null}
      <button
        type="button"
        className="hover:text-[var(--text)]"
        onClick={() => {
          const id = selectRelative(-1);
          const cue = useEditorStore.getState().cues.find((item) => item.id === id);
          if (cue) onSeek(cue.startMs, { play: true });
        }}
      >
        前句
      </button>
      <button
        type="button"
        className="hover:text-[var(--text)]"
        onClick={() => {
          const id = selectRelative(1);
          const cue = useEditorStore.getState().cues.find((item) => item.id === id);
          if (cue) onSeek(cue.startMs, { play: true });
        }}
      >
        後句
      </button>
      <span className="ml-auto">TIP 點擊下方句子就能改字</span>
      <Link href="/" className="hover:text-[var(--text)]">
        說明
      </Link>
      <Link
        href="/studio"
        className="rounded-full bg-[var(--accent-2)] px-3 py-0.5 font-bold text-[#0a0a0a]"
      >
        Subby
      </Link>
    </footer>
  );
}
