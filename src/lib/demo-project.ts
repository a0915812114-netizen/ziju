import type { Cue } from "./types";
import { newId } from "./cues";

export const DEMO_MEDIA_LABEL = "示範專案（無需上傳）";

export const DEMO_CUES: Cue[] = [
  {
    id: newId(),
    startMs: 0,
    endMs: 2200,
    text: "上字幕最花時間。",
    words: [],
  },
  {
    id: newId(),
    startMs: 2200,
    endMs: 4800,
    text: "三十秒的片，常常修一天。",
    words: [],
  },
  {
    id: newId(),
    startMs: 4800,
    endMs: 7600,
    text: "字句先幫你聽打、斷句。",
    words: [],
  },
  {
    id: newId(),
    startMs: 7600,
    endMs: 11000,
    text: "你只要看一遍、改專有名詞。",
    words: [],
  },
  {
    id: newId(),
    startMs: 11000,
    endMs: 14200,
    text: "Enter 斷句，Backspace 合併。",
    words: [],
  },
  {
    id: newId(),
    startMs: 14200,
    endMs: 17600,
    text: "改過的詞會進詞庫，下次更準。",
    words: [],
  },
];
