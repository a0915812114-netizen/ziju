import { toTaiwanTraditional } from "@/lib/taiwan";

export const maxDuration = 30;

export async function POST(request: Request) {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!groqKey && !openaiKey) {
    return Response.json({ error: "NO_KEY" }, { status: 401 });
  }

  const body = (await request.json()) as {
    lines?: unknown;
    glossary?: unknown;
  };
  const lines = Array.isArray(body.lines)
    ? body.lines.map((line) => String(line ?? "").trim())
    : [];
  if (lines.length === 0) return Response.json({ lines: [] });
  if (lines.length > 400) {
    return Response.json({ error: "TOO_MANY" }, { status: 413 });
  }

  const glossary = Array.isArray(body.glossary)
    ? body.glossary.map((item) => String(item).trim()).filter(Boolean).slice(0, 40)
    : [];

  try {
    const polished = groqKey
      ? await polishWithChat({
          url: "https://api.groq.com/openai/v1/chat/completions",
          key: groqKey,
          model: "llama-3.3-70b-versatile",
          lines,
          glossary,
        })
      : await polishWithChat({
          url: "https://api.openai.com/v1/chat/completions",
          key: openaiKey as string,
          model: "gpt-4o-mini",
          lines,
          glossary,
        });
    return Response.json({ lines: polished });
  } catch {
    return Response.json({ lines });
  }
}

async function polishWithChat(opts: {
  url: string;
  key: string;
  model: string;
  lines: string[];
  glossary: string[];
}) {
  const response = await fetch(opts.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是台灣繁體中文字幕校對，專門處理家庭口語與小孩說話。只修正明顯錯字、同音字、簡體殘留。稱呼：阿公不要寫成阿中、阿忠；阿嬤不要寫成阿媽、阿摩。水果芭樂不要寫成巴樂、把樂。保留嗯、啊、好哦、啦、欸。不增刪句數、不改順序、不發明沒講的話。人名與專有名詞以詞庫為準。輸出 JSON：{\"lines\":[\"...\"]}，陣列長度必須與輸入相同。",
        },
        {
          role: "user",
          content: JSON.stringify({
            glossary: opts.glossary,
            lines: opts.lines,
          }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error("polish failed");
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(raw) as { lines?: unknown };
  if (!Array.isArray(parsed.lines) || parsed.lines.length !== opts.lines.length) {
    throw new Error("length mismatch");
  }
  return parsed.lines.map((line, index) => {
    const next = toTaiwanTraditional(String(line ?? "").trim());
    return next || opts.lines[index] || "";
  });
}
