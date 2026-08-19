import {
  clientIp,
  consumePublicQuota,
  isOwnerRequest,
  MAX_TRANSCRIBE_BYTES,
  publicQuota,
} from "@/lib/access";
import { isChineseLang, whisperLanguage } from "@/lib/languages";
import { cleanCueText } from "@/lib/clean-cue";
import { newId, splitForReading } from "@/lib/cues";
import { secondsToMs } from "@/lib/time";
import { issueTranscribeTicket, verifyTranscribeTicket } from "@/lib/transcribe-ticket";
import type { Cue, Word } from "@/lib/types";
import { isRiffWave, repairPcmWav } from "@/lib/wav";

export const maxDuration = 60;

type WhisperWord = {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
};

type WhisperSegment = {
  start?: number;
  end?: number;
  text?: string;
  words?: WhisperWord[];
};

type WhisperResponse = {
  text?: string;
  segments?: WhisperSegment[];
  words?: WhisperWord[];
};

export async function GET(request: Request) {
  const groq = Boolean(process.env.GROQ_API_KEY?.trim());
  const openai = Boolean(process.env.OPENAI_API_KEY?.trim());
  const owner = isOwnerRequest(request.headers.get("cookie"));
  const quota = owner ? null : publicQuota(clientIp(request));
  return Response.json({
    configured: groq || openai,
    provider: groq ? "groq" : openai ? "openai" : null,
    owner,
    remaining: quota ? quota.remaining : null,
  });
}

export async function POST(request: Request) {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!groqKey && !openaiKey) {
    return Response.json(
      {
        error: "NO_KEY",
        message: "尚未設定 GROQ_API_KEY 或 OPENAI_API_KEY，可先載入示範稿。",
      },
      { status: 401 },
    );
  }

  const owner = isOwnerRequest(request.headers.get("cookie"));

  const form = await request.formData();
  const audio = form.get("audio");
  const glossaryRaw = String(form.get("glossary") ?? "");
  const languageRaw = String(form.get("language") ?? "auto");
  const language = whisperLanguage(languageRaw);
  const chinese = isChineseLang(languageRaw);
  const durationMs = Math.max(0, Number(form.get("durationMs") ?? 0));
  if (!(audio instanceof File)) {
    return Response.json({ error: "請上傳音訊" }, { status: 400 });
  }
  if (audio.size > MAX_TRANSCRIBE_BYTES) {
    return Response.json(
      {
        error: "TOO_LARGE",
        message: "這一段音訊超過上限。長片會自動分段，若仍失敗請先轉成較小的 mp4。",
      },
      { status: 413 },
    );
  }

  const ip = clientIp(request);
  const chunkIndex = Number(form.get("chunkIndex") ?? 0);
  const ticket = String(form.get("ticket") ?? "");
  if (!owner) {
    if (chunkIndex > 0) {
      if (!verifyTranscribeTicket(ticket, ip)) {
        return Response.json(
          { error: "RATE_LIMITED", message: "分段聽打逾時，請再按一次開始製作。" },
          { status: 429 },
        );
      }
    } else {
      const quota = consumePublicQuota(ip);
      if (!quota.ok) {
        return Response.json(
          {
            error: "RATE_LIMITED",
            message: "公開聽打次數用完了。編輯、對時間、燒字幕仍可用。",
          },
          { status: 429 },
        );
      }
    }
  }

  const prefix = String(form.get("prefix") ?? "").trim();
  const glossary = glossaryRaw
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const prompt = whisperPrompt(languageRaw, glossary, prefix);

  try {
    const transcribed = groqKey
      ? await transcribe({
          url: "https://api.groq.com/openai/v1/audio/transcriptions",
          key: groqKey,
          model: "whisper-large-v3",
          file: audio,
          prompt,
          language,
        })
      : await transcribe({
          url: "https://api.openai.com/v1/audio/transcriptions",
          key: openaiKey as string,
          model: "whisper-1",
          file: audio,
          prompt,
          language,
        });

    const rawCues = cuesFromTranscript(transcribed, durationMs);
    if (rawCues.length === 0) {
      return Response.json(
        {
          error: "EMPTY",
          message: "沒聽出字幕。請確認片子有人聲，語言改成繁體中文再試一次。",
        },
        { status: 422 },
      );
    }

    const cues = splitForReading(rawCues)
      .map((cue) => ({
        ...cue,
        text: chinese ? cleanCueText(cue.text) : cue.text.trim(),
        words: cue.words.map((word) => ({
          ...word,
          text: chinese ? cleanCueText(word.text) || word.text : word.text,
        })),
      }))
      .filter((cue) => cue.text);

    return Response.json({
      cues,
      provider: groqKey ? "groq" : "openai",
      ticket: owner ? "" : issueTranscribeTicket(ip),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "聽打失敗";
    return Response.json({ error: "ASR_FAILED", message }, { status: 500 });
  }
}

async function transcribe(opts: {
  url: string;
  key: string;
  model: string;
  file: File;
  prompt: string;
  language: string;
}): Promise<WhisperResponse> {
  const body = new FormData();
  const prepared = prepareGroqAudio(new Uint8Array(await opts.file.arrayBuffer()), opts.file);
  body.set(
    "file",
    new File([Buffer.from(prepared.bytes)], prepared.filename, { type: prepared.type }),
  );
  body.set("model", opts.model);
  body.set("response_format", "verbose_json");
  body.set("temperature", "0");
  if (opts.language) body.set("language", opts.language);
  if (opts.prompt) body.set("prompt", opts.prompt);
  if (opts.model === "whisper-1") {
    body.append("timestamp_granularities[]", "word");
    body.append("timestamp_granularities[]", "segment");
  }

  const response = await fetch(opts.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.key}` },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    if (/valid media file/i.test(detail)) {
      throw new Error("聲音抽好了但 Groq 還是讀不到。請再按一次開始製作。");
    }
    throw new Error(`聽打失敗：${response.status} ${detail.slice(0, 180)}`);
  }
  return (await response.json()) as WhisperResponse;
}

function whisperPrompt(language: string, glossary: string[], prefix: string) {
  const head =
    language === "en"
      ? "Conversational English transcript."
      : language === "ja"
        ? "自然な日本語の書き起こし。"
        : language === "ko"
          ? "자연스러운 한국어 전사."
        : isChineseLang(language) || !language
          ? "台灣繁體中文口語逐字稿。家庭稱呼用阿公、阿嬤。嗯、啊、好哦都保留。"
          : "Natural spoken transcript.";
  const terms = glossary.slice(0, 24).join("、");
  return [head, terms, prefix].filter(Boolean).join(" ").slice(-900);
}

function prepareGroqAudio(bytes: Uint8Array, file: File) {
  if (isRiffWave(bytes) || file.type.includes("wav") || file.name.toLowerCase().endsWith(".wav")) {
    return {
      bytes: repairPcmWav(bytes),
      filename: "audio.wav",
      type: "audio/wav",
    };
  }
  const name = file.name.toLowerCase();
  const filename = name.replace(/[^a-z0-9.]+/g, "") || "audio.mp3";
  return {
    bytes,
    filename: filename.endsWith(".mp3") ? "audio.mp3" : filename,
    type: file.type || "audio/mpeg",
  };
}

function cuesFromTranscript(payload: WhisperResponse, durationMs: number): Cue[] {
  const fromWords = wordsToCues(payload.words ?? [], durationMs);
  const fromSegments = segmentsToCues(payload);
  const base = richerCues(fromWords, fromSegments);
  const fullText = (payload.text ?? "").trim();
  if (base.length === 0) {
    if (!fullText) return [];
    return [
      {
        id: newId(),
        startMs: 0,
        endMs: Math.max(durationMs, 4000),
        text: fullText,
        words: [],
      },
    ];
  }
  const leftover = leftoverSpeech(
    fullText,
    base.map((cue) => cue.text).join(""),
  );
  const covered = Math.max(...base.map((cue) => cue.endMs));
  if (leftover && covered < durationMs - 400) {
    base.push({
      id: newId(),
      startMs: covered,
      endMs: Math.max(durationMs, covered + 80),
      text: leftover,
      words: [],
    });
  }
  return base;
}

function richerCues(left: Cue[], right: Cue[]) {
  const score = (cues: Cue[]) =>
    cues.reduce((sum, cue) => sum + cue.text.replace(/\s/g, "").length, 0);
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  return score(left) >= score(right) ? left : right;
}

function leftoverSpeech(full: string, used: string) {
  const compactFull = full.replace(/\s/g, "");
  const compactUsed = used.replace(/\s/g, "");
  if (!compactFull || compactFull.length <= compactUsed.length + 2) return "";
  if (compactUsed && compactFull.startsWith(compactUsed)) {
    return compactFull.slice(compactUsed.length);
  }
  return "";
}

function segmentsToCues(payload: WhisperResponse): Cue[] {
  const segments = payload.segments ?? [];
  const mapped = segments
    .map((segment) => {
      const text = (segment.text ?? "").trim();
      const startMs = secondsToMs(segment.start ?? 0);
      const endMs = secondsToMs(segment.end ?? (segment.start ?? 0) + 1);
      const words: Word[] = (segment.words ?? [])
        .map((word) => ({
          text: (word.word ?? word.text ?? "").trim(),
          startMs: secondsToMs(word.start ?? 0),
          endMs: secondsToMs(word.end ?? 0),
        }))
        .filter((word) => word.text);
      return {
        id: newId(),
        startMs,
        endMs: Math.max(startMs + 80, endMs),
        text,
        words,
      };
    })
    .filter((cue) => cue.text);
  if (mapped.length === 0) return [];
  const span = Math.max(...mapped.map((cue) => cue.endMs)) - Math.min(...mapped.map((cue) => cue.startMs));
  if (span < 80) return [];
  return mapped;
}

function wordsToCues(raw: WhisperWord[], durationMs: number): Cue[] {
  const words: Word[] = raw
    .map((word) => ({
      text: (word.word ?? word.text ?? "").trim(),
      startMs: secondsToMs(word.start ?? 0),
      endMs: secondsToMs(word.end ?? 0),
    }))
    .filter((word) => word.text);
  if (words.length === 0) return [];
  const cues: Cue[] = [];
  let buf: Word[] = [];
  let chars = 0;
  const flush = () => {
    if (buf.length === 0) return;
    const first = buf[0];
    const last = buf[buf.length - 1];
    if (!first || !last) return;
    cues.push({
      id: newId(),
      startMs: first.startMs,
      endMs: Math.max(first.startMs + 80, last.endMs || durationMs),
      text: buf.map((word) => word.text).join(""),
      words: buf,
    });
    buf = [];
    chars = 0;
  };
  for (const word of words) {
    buf.push(word);
    chars += word.text.length;
    if (chars >= 16 || /[，。！？、；!?]$/.test(word.text)) flush();
  }
  flush();
  return cues;
}
