import {
  clientIp,
  consumePublicQuota,
  isOwnerRequest,
  MAX_TRANSCRIBE_BYTES,
  publicQuota,
} from "@/lib/access";
import { newId, splitForReading } from "@/lib/cues";
import { toTaiwanTraditional } from "@/lib/taiwan";
import { secondsToMs } from "@/lib/time";
import type { Cue, Word } from "@/lib/types";

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
};

export async function GET(request: Request) {
  const groq = Boolean(process.env.GROQ_API_KEY);
  const openai = Boolean(process.env.OPENAI_API_KEY);
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
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
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
  if (!(audio instanceof File)) {
    return Response.json({ error: "請上傳音訊" }, { status: 400 });
  }
  if (audio.size > MAX_TRANSCRIBE_BYTES) {
    return Response.json(
      {
        error: "TOO_LARGE",
        message: "音訊超過 4MB，請先用較短片段，或把片子壓成較小的 mp3。",
      },
      { status: 413 },
    );
  }

  if (!owner) {
    const quota = consumePublicQuota(clientIp(request));
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

  const glossary = glossaryRaw
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const prompt = [
    "這是台灣繁體中文口語。專有名詞請保持原樣：",
    ...glossary,
  ].join(" ");

  try {
    const transcribed = groqKey
      ? await transcribe({
          url: "https://api.groq.com/openai/v1/audio/transcriptions",
          key: groqKey,
          model: "whisper-large-v3-turbo",
          file: audio,
          prompt,
        })
      : await transcribe({
          url: "https://api.openai.com/v1/audio/transcriptions",
          key: openaiKey as string,
          model: "whisper-1",
          file: audio,
          prompt,
        });

    const cues = splitForReading(segmentsToCues(transcribed)).map((cue) => ({
      ...cue,
      text: toTaiwanTraditional(cue.text),
      words: cue.words.map((word) => ({
        ...word,
        text: toTaiwanTraditional(word.text),
      })),
    }));

    return Response.json({
      cues,
      provider: groqKey ? "groq" : "openai",
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
}): Promise<WhisperResponse> {
  const body = new FormData();
    body.set("file", opts.file, opts.file.name || "audio.wav");
  body.set("model", opts.model);
  body.set("response_format", "verbose_json");
  body.set("language", "zh");
  body.set("prompt", opts.prompt.slice(0, 900));
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
    throw new Error(`聽打失敗：${response.status} ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as WhisperResponse;
}

function segmentsToCues(payload: WhisperResponse): Cue[] {
  const segments = payload.segments ?? [];
  if (segments.length === 0 && payload.text) {
    return [
      {
        id: newId(),
        startMs: 0,
        endMs: 3000,
        text: payload.text.trim(),
        words: [],
      },
    ];
  }
  return segments
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
}
