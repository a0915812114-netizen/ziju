"use client";

import { charCount, charsPerSecond, currentCueIndex } from "@/lib/cues";
import { formatListTime, formatPrecise } from "@/lib/time";
import { useEditorStore } from "@/store/editor-store";
import { useEffect, useRef, useState } from "react";

type Props = {
  onSeek: (ms: number) => void;
};

export function CueList({ onSeek }: Props) {
  const cues = useEditorStore((s) => s.cues);
  const selectedId = useEditorStore((s) => s.selectedId);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const altMode = useEditorStore((s) => s.altMode);
  const findText = useEditorStore((s) => s.findText);
  const replaceText = useEditorStore((s) => s.replaceText);
  const glossary = useEditorStore((s) => s.glossary);
  const selectCue = useEditorStore((s) => s.selectCue);
  const updateCueText = useEditorStore((s) => s.updateCueText);
  const splitSelected = useEditorStore((s) => s.splitSelected);
  const mergeWithPrevious = useEditorStore((s) => s.mergeWithPrevious);
  const addGlossary = useEditorStore((s) => s.addGlossary);
  const removeGlossary = useEditorStore((s) => s.removeGlossary);
  const setFind = useEditorStore((s) => s.setFind);
  const setReplace = useEditorStore((s) => s.setReplace);
  const replaceAll = useEditorStore((s) => s.replaceAll);
  const setToast = useEditorStore((s) => s.setToast);
  const [editingId, setEditingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeId = cues[currentCueIndex(cues, currentTimeMs)]?.id;
  const selected = cues.find((cue) => cue.id === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    const node = listRef.current?.querySelector(`[data-cue="${selectedId}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <section className="flex min-h-0 flex-col bg-[var(--panel)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <input
          value={findText}
          onChange={(event) => setFind(event.target.value)}
          placeholder="搜尋字幕"
          className="field min-w-40 flex-1"
        />
        <input
          value={replaceText}
          onChange={(event) => setReplace(event.target.value)}
          placeholder="取代成"
          className="field w-28"
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            const count = replaceAll();
            setToast(count ? `已取代 ${count} 處` : "找不到符合的字");
          }}
        >
          取代
        </button>
      </div>
      {glossary.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-[var(--line)] px-3 py-1.5">
          {glossary.map((term) => (
            <button
              key={term}
              type="button"
              className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs"
              onClick={() => removeGlossary(term)}
            >
              {term}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {cues.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[var(--muted)]">
            上傳檔案開始聽打，或載入示範稿。
          </p>
        ) : (
          cues.map((cue, index) => {
            const isSelected = cue.id === selectedId;
            const active = cue.id === activeId;
            const editing = editingId === cue.id;
            const hit = findText && cue.text.includes(findText);
            return (
              <div
                key={cue.id}
                data-cue={cue.id}
                className="grid grid-cols-[64px_1fr_36px] gap-2 border-b border-[var(--line)] px-3 py-2"
                style={{
                  background: isSelected
                    ? "rgba(57, 255, 20, 0.28)"
                    : active
                      ? "rgba(31, 158, 75, 0.08)"
                      : hit
                        ? "rgba(0, 191, 239, 0.08)"
                        : "transparent",
                }}
                onClick={() => {
                  selectCue(cue.id);
                  onSeek(cue.startMs);
                }}
              >
                <div className="pt-1 font-mono text-[11px] text-[var(--muted)]">
                  {formatListTime(cue.startMs)}
                </div>
                {editing && !altMode ? (
                  <textarea
                    autoFocus
                    defaultValue={cue.text}
                    rows={2}
                    className="field w-full resize-none"
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => {
                      const next = event.currentTarget.value;
                      if (next !== cue.text) {
                        updateCueText(cue.id, next);
                        const added = guessNewTerm(cue.text, next);
                        if (added) addGlossary(added);
                      }
                      setEditingId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        const indexAt =
                          event.currentTarget.selectionStart ??
                          event.currentTarget.value.length;
                        updateCueText(cue.id, event.currentTarget.value);
                        selectCue(cue.id);
                        splitSelected(indexAt);
                        setEditingId(null);
                      }
                      if (
                        event.key === "Backspace" &&
                        (event.currentTarget.selectionStart ?? 0) === 0 &&
                        (event.currentTarget.selectionEnd ?? 0) === 0
                      ) {
                        event.preventDefault();
                        mergeWithPrevious(cue.id);
                        setEditingId(null);
                      }
                      if (event.key === "Tab") {
                        event.preventDefault();
                        const dir = event.shiftKey ? -1 : 1;
                        const next = cues[index + dir];
                        if (next) {
                          selectCue(next.id);
                          setEditingId(next.id);
                          onSeek(next.startMs);
                        }
                      }
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : altMode ? (
                  <CharSplit
                    text={cue.text}
                    onSplit={(at) => {
                      selectCue(cue.id);
                      splitSelected(at);
                    }}
                  />
                ) : (
                  <p
                    className="cursor-text py-0.5 leading-6"
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      selectCue(cue.id);
                      setEditingId(cue.id);
                    }}
                  >
                    {cue.text || "（空白）"}
                  </p>
                )}
                <div className="pt-1 text-right font-mono text-[11px] text-[var(--muted)]">
                  {charCount(cue.text)}
                </div>
              </div>
            );
          })
        )}
      </div>
      {selected ? (
        <div className="flex flex-wrap gap-3 border-t border-[var(--line)] px-3 py-2 font-mono text-[11px] text-[var(--muted)]">
          <span>{formatPrecise(selected.startMs)}</span>
          <span>{((selected.endMs - selected.startMs) / 1000).toFixed(2)} 秒</span>
          <span>{charCount(selected.text)} 字</span>
          <span>{charsPerSecond(selected).toFixed(1)} 字／秒</span>
        </div>
      ) : null}
    </section>
  );
}

function CharSplit({
  text,
  onSplit,
}: {
  text: string;
  onSplit: (index: number) => void;
}) {
  const chars = [...text];
  return (
    <p className="flex flex-wrap gap-y-1 py-1 leading-7">
      {chars.map((char, index) => (
        <span key={`${index}-${char}`} className="inline-flex items-center">
          {index > 0 ? (
            <button
              type="button"
              className="mx-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
              title="在這裡斷句"
              onClick={(event) => {
                event.stopPropagation();
                onSplit(index);
              }}
            />
          ) : null}
          {char}
        </span>
      ))}
    </p>
  );
}

function guessNewTerm(before: string, after: string) {
  if (before === after) return null;
  const afterTokens =
    after.match(/[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z0-9]{1,20}/g) ?? [];
  const beforeSet = new Set(
    before.match(/[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z0-9]{1,20}/g) ?? [],
  );
  return afterTokens.find((token) => !beforeSet.has(token)) ?? null;
}
