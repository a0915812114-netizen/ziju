import {
  clientIp,
  isOwnerRequest,
  MAX_TRANSCRIBE_BYTES,
} from "@/lib/access";
import { isChineseLang, whisperLanguage } from "@/lib/languages";
import { cleanCueText } from "@/lib/clean-cue";
import { newId, splitForReading } from "@/lib/cues";
import { PUBLIC_FAIL, publicFailMessage } from "@/lib/public-error";
import {
  addTranscribeJobMs,
  consumeQuota,
  isSecureRequest,
  jsonWithCookie,
  newTranscribeJobId,
  publicQuota,
  quotaCookie,
} from "@/lib/quota";
import { secondsToMs } from "@/lib/time";
import { issueTranscribeTicket, verifyTranscribeTicket } from "@/lib/transcribe-ticket";
import type { Cue, Word } from "@/lib/types";
import { inspectWavUpload, MAX_MEDIA_MS } from "@/lib/upload-policy";
import { repairPcmWav } from "@/lib/wav";

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
  const quota = owner ? null : publicQuota(clientIp(request), request.headers.get("cookie"));
  return jsonWithCookie(
    {
      configured: groq || openai,
      provider: groq ? "groq" : openai ? "openai" : null,
      owner,
      remaining: quota ? quota.remaining : null,
    },
    200,
    quota && (quota.state.transcribe > 0 || quota.state.chat > 0)
      ? quotaCookie(quota.state, isSecureRequest(request))
      : null,
  );
}

export async function POST(request: Request) {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!groqKey && !openaiKey) {
    return Response.json(
      {
        error: "NO_KEY",
        message: "聽打還沒開好，可先載入示範稿。",
      },
      { status: 401 },
    );
  }

  const owner = isOwnerRequest(request.headers.get("cookie"));
  const secure = isSecureRequest(request);
  const cookies = request.headers.get("cookie");

  const form = await request.formData();
  const audio = form.get("audio");
  const glossaryRaw = String(form.get("glossary") ?? "");
  const languageRaw = String(form.get("language") ?? "auto");
  const language = whisperLanguage(languageRaw);
  const chinese = isChineseLang(languageRaw);
  const claimedMs = Math.max(0, Number(form.get("durationMs") ?? 0));
  if (!(audio instanceof File)) {
    return Response.json({ error: "請上傳音訊", message: "請上傳音訊" }, { status: 400 });
  }
  if (claimedMs > MAX_MEDIA_MS) {
    return Response.json(
      { error: "TOO_LONG", message: "目前最長 40 分鐘。請先剪短再製作。" },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await audio.arrayBuffer());
  const wav = inspectWavUpload(bytes, audio.size, MAX_TRANSCRIBE_BYTES);
  if (!wav.ok) {
    return Response.json({ error: "BAD_AUDIO", message: wav.message }, { status: 400 });
  }
  const durationMs = Math.min(wav.durationMs, claimedMs || wav.durationMs);

  const ip = clientIp(request);
  const chunkIndex = Number(form.get("chunkIndex") ?? 0);
  const ticket = String(form.get("ticket") ?? "");
  let quotaCookieValue: string | null = null;
  let jobId = "";
  let usedMs = 0;
  const jobExp = Date.now() + 25 * 60 * 1000;

  if (chunkIndex > 0) {
    const parsed = verifyTranscribeTicket(ticket, ip);
    if (!parsed) {
      return Response.json(
        { error: "RATE_LIMITED", message: "分段聽打逾時，請再按一次開始製作。" },
        { status: 429 },
      );
    }
    jobId = parsed.jobId;
    const nextUsed = addTranscribeJobMs(jobId, wav.durationMs, parsed.exp, parsed.usedMs);
    if (nextUsed === null) {
      return Response.json(
        { error: "TOO_LONG", message: "目前最長 40 分鐘。請先剪短再製作。" },
        { status: 400 },
      );
    }
    usedMs = nextUsed;
  } else {
    if (!owner) {
      const quota = consumeQuota("transcribe", ip, cookies, secure);
      quotaCookieValue = quota.cookie;
      if (!quota.ok) {
        return jsonWithCookie(
          {
            error: "RATE_LIMITED",
            message: "公開聽打次數用完了。編輯、對時間、燒字幕仍可用。",
          },
          429,
          quotaCookieValue,
        );
      }
    }
    jobId = newTranscribeJobId();
    const nextUsed = addTranscribeJobMs(jobId, wav.durationMs, jobExp, 0);
    if (nextUsed === null) {
      return jsonWithCookie(
        { error: "TOO_LONG", message: "目前最長 40 分鐘。請先剪短再製作。" },
        400,
        quotaCookieValue,
      );
    }
    usedMs = nextUsed;
  }

  const prefix = String(form.get("prefix") ?? "").trim();
  const glossary = glossaryRaw
    .split("\n")
    .map((item) => item.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 40);
  const prompt = whisperPrompt(languageRaw, glossary, prefix);

  try {
    const prepared = {
      bytes: repairPcmWav(bytes),
      filename: "audio.wav",
      type: "audio/wav",
    };
    const transcribed = groqKey
      ? await transcribe({
          url: "https://api.groq.com/openai/v1/audio/transcriptions",
          key: groqKey,
          model: "whisper-large-v3",
          prepared,
          prompt,
          language,
        })
      : await transcribe({
          url: "https://api.openai.com/v1/audio/transcriptions",
          key: openaiKey as string,
          model: "whisper-1",
          prepared,
          prompt,
          language,
        });

    const rawCues = cuesFromTranscript(transcribed, durationMs);
    if (rawCues.length === 0) {
      return jsonWithCookie(
        {
          error: "EMPTY",
          message: "沒聽出字幕。請確認片子有人聲，語言改成繁體中文再試一次。",
        },
        422,
        quotaCookieValue,
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

    return jsonWithCookie(
      {
        cues,
        provider: groqKey ? "groq" : "openai",
        ticket: issueTranscribeTicket(ip, jobId, usedMs),
      },
      200,
      quotaCookieValue,
    );
  } catch (error) {
    return jsonWithCookie(
      { error: "ASR_FAILED", message: publicFailMessage(error) },
      500,
      quotaCookieValue,
    );
  }
}

async function transcribe(opts: {
  url: string;
  key: string;
  model: string;
  prepared: { bytes: Uint8Array; filename: string; type: string };
  prompt: string;
  language: string;
}): Promise<WhisperResponse> {
  const body = new FormData();
  body.set(
    "file",
    new File([Buffer.from(opts.prepared.bytes)], opts.prepared.filename, {
      type: opts.prepared.type,
    }),
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
    if (/prompt length/i.test(detail) && opts.prompt) {
      return transcribe({ ...opts, prompt: "" });
    }
    if (/valid media file/i.test(detail)) {
      throw new Error("聲音抽好了但還是讀不到。請再按一次開始製作。");
    }
    throw new Error(PUBLIC_FAIL);
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
            ? "台灣繁體口語。稱呼用阿公、阿嬤。水果寫芭樂。語氣詞保留。"
            : "Natural spoken transcript.";
  const terms = glossary.slice(0, 8).join("、");
  const guide = [head, terms].filter(Boolean).join(" ");
  const guideClipped = clipUtf8Start(guide, 360);
  const room = Math.max(0, GROQ_PROMPT_BYTES - utf8Bytes(guideClipped) - 1);
  const prev = clipUtf8End(prefix.replace(/\s+/g, " ").trim(), room);
  return [guideClipped, prev].filter(Boolean).join(" ");
}

const GROQ_PROMPT_BYTES = 850;

function utf8Bytes(text: string) {
  return new TextEncoder().encode(text).length;
}

function clipUtf8End(text: string, maxBytes: number) {
  if (maxBytes <= 0 || !text) return "";
  if (utf8Bytes(text) <= maxBytes) return text;
  let start = Math.max(0, text.length - Math.floor(maxBytes / 3) - 8);
  let slice = text.slice(start);
  while (slice.length && utf8Bytes(slice) > maxBytes) {
    start += 1;
    slice = text.slice(start);
  }
  return slice;
}

function clipUtf8Start(text: string, maxBytes: number) {
  if (maxBytes <= 0 || !text) return "";
  if (utf8Bytes(text) <= maxBytes) return text;
  let end = Math.min(text.length, Math.floor(maxBytes / 3) + 8);
  let slice = text.slice(0, end);
  while (slice.length && utf8Bytes(slice) > maxBytes) {
    end -= 1;
    slice = text.slice(0, end);
  }
  return slice;
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
