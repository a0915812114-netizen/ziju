"use client";

import { charCount, charsPerSecond, cueAtTime, cueHasFind } from "@/lib/cues";
import { formatListTime, formatPlayerTime } from "@/lib/time";
import type { SeekOpts } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { useEffect, useRef, useState } from "react";

type Props = {
  onSeek: (ms: number, opts?: SeekOpts) => void;
};

type Tab = "cues" | "import" | "keys";

export function CueList({ onSeek }: Props) {
  const cues = useEditorStore((s) => s.cues);
  const selectedId = useEditorStore((s) => s.selectedId);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const altMode = useEditorStore((s) => s.altMode);
  const findText = useEditorStore((s) => s.findText);
  const replaceText = useEditorStore((s) => s.replaceText);
  const glossary = useEditorStore((s) => s.glossary);
  const selectCue = useEditorStore((s) => s.selectCue);
  const recordHistory = useEditorStore((s) => s.recordHistory);
  const updateCueText = useEditorStore((s) => s.updateCueText);
  const splitSelected = useEditorStore((s) => s.splitSelected);
  const mergeWithPrevious = useEditorStore((s) => s.mergeWithPrevious);
  const addGlossary = useEditorStore((s) => s.addGlossary);
  const removeGlossary = useEditorStore((s) => s.removeGlossary);
  const setFind = useEditorStore((s) => s.setFind);
  const setReplace = useEditorStore((s) => s.setReplace);
  const replaceAll = useEditorStore((s) => s.replaceAll);
  const replaceInSelected = useEditorStore((s) => s.replaceInSelected);
  const setToast = useEditorStore((s) => s.setToast);
  const removeCue = useEditorStore((s) => s.removeCue);
  const importSrt = useEditorStore((s) => s.importSrt);
  const [tab, setTab] = useState<Tab>("cues");
  const listRef = useRef<HTMLDivElement>(null);
  const srtRef = useRef<HTMLInputElement>(null);
  const editOrigin = useRef("");
  const activeId = cueAtTime(cues, currentTimeMs)?.id;
  const selected = cues.find((cue) => cue.id === selectedId);
  const needle = findText.trim();
  const hits = needle ? cues.filter((cue) => cueHasFind(cue.text, needle)) : [];
  const hitIndex = hits.findIndex((cue) => cue.id === selectedId);
  const visible = needle ? hits : cues;

  useEffect(() => {
    if (!selectedId) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && listRef.current?.contains(focused)) return;
    const node = listRef.current?.querySelector(`[data-cue="${selectedId}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const hitIds = hits.map((cue) => cue.id).join(",");

  useEffect(() => {
    if (!needle || hits.length === 0) return;
    if (hits.some((cue) => cue.id === selectedId)) return;
    const first = hits[0];
    if (!first) return;
    selectCue(first.id);
    onSeek(first.startMs, { pause: true });
  }, [needle, hitIds, hits, selectedId, selectCue, onSeek]);

  function goHit(dir: -1 | 1) {
    if (hits.length === 0) return;
    const from = hitIndex < 0 ? (dir === 1 ? 0 : hits.length - 1) : hitIndex + dir;
    const next = hits[(from + hits.length) % hits.length];
    if (!next) return;
    selectCue(next.id);
    onSeek(next.startMs, { pause: true });
  }

  function runReplace(kind: "one" | "all") {
    if (!needle) {
      setToast("先輸入要搜尋的字");
      return;
    }
    const count = kind === "all" ? replaceAll() : replaceInSelected();
    setToast(
      count
        ? kind === "all"
          ? `已取代 ${count} 處`
          : `這句已取代 ${count} 處`
        : "找不到符合的字",
    );
  }

  function openText(id: string, startMs: number) {
    selectCue(id);
    onSeek(startMs, { pause: true });
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--panel)]">
      <div className="flex items-center gap-5 border-b border-[var(--line)] px-4 pt-3 text-sm">
        {(
          [
            ["cues", "字幕模式"],
            ["import", "匯入修正字幕"],
            ["keys", "快捷鍵"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`pb-2 ${tab === id ? "border-b-2 border-[var(--text)] font-medium text-[var(--text)]" : "text-[var(--muted)]"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "cues" ? (
        <>
          <div className="border-b border-[var(--line)] px-3 py-2">
            <label className="relative block">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--muted)]">
                <SearchIcon />
              </span>
              <input
                id="ziju-cue-search"
                value={findText}
                onChange={(event) => setFind(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    goHit(event.shiftKey ? -1 : 1);
                  }
                }}
                placeholder="搜尋字幕"
                className="field w-full rounded-full pl-8 pr-16"
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-[var(--muted)]">
                {needle ? (hits.length ? `${Math.max(1, hitIndex + 1)}/${hits.length}` : "0/0") : ""}
              </span>
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={replaceText}
                onChange={(event) => setReplace(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runReplace(event.shiftKey ? "all" : "one");
                  }
                }}
                placeholder="取代成"
                className="field min-w-0 flex-1 rounded-full"
              />
              <button
                type="button"
                className="btn shrink-0 px-2 py-1 text-xs"
                disabled={!needle}
                onClick={() => goHit(-1)}
              >
                上一個
              </button>
              <button
                type="button"
                className="btn shrink-0 px-2 py-1 text-xs"
                disabled={!needle}
                onClick={() => goHit(1)}
              >
                下一個
              </button>
              <button
                type="button"
                className="btn shrink-0 px-2 py-1 text-xs"
                disabled={!needle}
                onClick={() => runReplace("one")}
              >
                這句
              </button>
              <button
                type="button"
                className="btn primary shrink-0 px-2 py-1 text-xs"
                disabled={!needle}
                onClick={() => runReplace("all")}
              >
                全部
              </button>
            </div>
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
                上傳檔案開始聽打，或載入示範稿。點字幕文字就能直接改。
              </p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-8 text-sm text-[var(--muted)]">
                沒有符合「{needle}」的字幕。
              </p>
            ) : (
              visible.map((cue, index) => {
                const isSelected = cue.id === selectedId;
                const active = cue.id === activeId;
                const hit = Boolean(needle && cueHasFind(cue.text, needle));
                return (
                  <div
                    key={cue.id}
                    data-cue={cue.id}
                    className="grid grid-cols-[52px_1fr_auto] gap-2 border-b border-[var(--line)] px-3 py-2"
                    style={{
                      background: active
                        ? "rgba(184, 255, 60, 0.35)"
                        : isSelected
                          ? "#f3f1ea"
                          : hit
                            ? "rgba(0, 191, 239, 0.08)"
                            : "transparent",
                    }}
                  >
                    <button
                      type="button"
                      className="pt-1 text-left font-mono text-[11px] text-[var(--muted)]"
                      onClick={() => {
                        selectCue(cue.id);
                        onSeek(cue.startMs, { play: true });
                      }}
                    >
                      {formatListTime(cue.startMs)}
                    </button>
                    {altMode ? (
                      <CharSplit
                        text={cue.text}
                        onSplit={(at) => {
                          selectCue(cue.id);
                          splitSelected(at);
                        }}
                      />
                    ) : (
                      <textarea
                        value={cue.text}
                        rows={Math.max(1, Math.ceil((cue.text.length || 8) / 18))}
                        spellCheck
                        className="w-full resize-none bg-transparent py-0.5 leading-6 outline-none"
                        placeholder="輸入字幕"
                        onFocus={() => {
                          editOrigin.current = cue.text;
                          openText(cue.id, cue.startMs);
                        }}
                        onChange={(event) => {
                          const next = event.currentTarget.value;
                          if (cue.text === editOrigin.current && next !== editOrigin.current) {
                            recordHistory();
                          }
                          updateCueText(cue.id, next, false);
                        }}
                        onBlur={(event) => {
                          const added = guessNewTerm(editOrigin.current, event.currentTarget.value);
                          if (added) addGlossary(added);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (event.ctrlKey || event.metaKey) {
                              const indexAt =
                                event.currentTarget.selectionStart ??
                                event.currentTarget.value.length;
                              updateCueText(cue.id, event.currentTarget.value, false);
                              selectCue(cue.id);
                              splitSelected(indexAt);
                              return;
                            }
                            event.currentTarget.blur();
                          }
                          if (
                            event.key === "Backspace" &&
                            (event.currentTarget.selectionStart ?? 0) === 0 &&
                            (event.currentTarget.selectionEnd ?? 0) === 0
                          ) {
                            event.preventDefault();
                            mergeWithPrevious(cue.id);
                          }
                          if (event.key === "Tab") {
                            event.preventDefault();
                            const dir = event.shiftKey ? -1 : 1;
                            const next = visible[index + dir];
                            if (next) {
                              openText(next.id, next.startMs);
                              window.requestAnimationFrame(() => {
                                const node = listRef.current?.querySelector(
                                  `[data-cue="${next.id}"] textarea`,
                                );
                                if (node instanceof HTMLTextAreaElement) node.focus();
                              });
                            }
                          }
                        }}
                      />
                    )}
                    <div className="flex items-start justify-end gap-2 pt-1 font-mono text-[11px] text-[var(--muted)]">
                      <span>{charCount(cue.text)}</span>
                      {isSelected ? (
                        <button
                          type="button"
                          className="text-sm leading-none text-[var(--muted)] hover:text-[var(--text)]"
                          aria-label="刪除這句"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeCue(cue.id);
                          }}
                        >
                          ×
                        </button>
                      ) : (
                        <span className="inline-block w-3" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}
      {tab === "import" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm">
          <p className="text-[var(--muted)]">匯入 SRT 或 VTT，會蓋掉現有字幕時間與文字。</p>
          <button type="button" className="btn w-fit" onClick={() => srtRef.current?.click()}>
            選擇字幕檔
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
              if (count) setTab("cues");
            }}
          />
          <p className="pt-2 text-xs text-[var(--muted)]">搜尋與取代請到「字幕模式」上方。</p>
        </div>
      ) : null}
      {tab === "keys" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm leading-7 text-[var(--muted)]">
          <p>空白鍵 播放／暫停</p>
          <p>B 或「切過當前」在播放頭切斷　Delete 刪除這句</p>
          <p>Ctrl+Z 復原　Ctrl+Y 重做</p>
          <p>Ctrl+Enter 斷句　行首 Backspace 合併　Alt 點字切斷</p>
          <p>↑ ↓ 前句／後句並出聲　M 對齊點</p>
          <p>Ctrl+F 搜尋　Enter 下一處　Shift+Enter 上一處</p>
          <p>取代欄 Enter 改這句　Shift+Enter 全部取代</p>
          <p>點影片上的字幕或右欄文字，可直接改</p>
          <p>點時間或波形塊會跳到那句並播放</p>
          <p>波形：滑過預覽畫面、點一下出聲、滾輪縮放、拖塊對時</p>
        </div>
      ) : null}
      {selected && tab === "cues" ? (
        <div className="flex flex-wrap gap-4 border-t border-[var(--line)] px-3 py-1.5 font-mono text-[11px] text-[var(--muted)]">
          <span>{formatPlayerTime(selected.startMs, true)}</span>
          <span>{((selected.endMs - selected.startMs) / 1000).toFixed(3)} 秒</span>
          <span>{charCount(selected.text)} 字</span>
          <span>{charsPerSecond(selected).toFixed(1)} 字／秒</span>
        </div>
      ) : null}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
