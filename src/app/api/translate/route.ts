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
    to?: unknown;
  };
  const lines = Array.isArray(body.lines)
    ? body.lines.map((line) => String(line ?? "").trim())
    : [];
  const to = String(body.to ?? "en");
  if (lines.length === 0) return Response.json({ lines: [] });
  if (lines.length > 400) return Response.json({ error: "TOO_MANY" }, { status: 413 });

  try {
    const translated = groqKey
      ? await translateWithChat({
          url: "https://api.groq.com/openai/v1/chat/completions",
          key: groqKey,
          model: "llama-3.3-70b-versatile",
          lines,
          to,
        })
      : await translateWithChat({
          url: "https://api.openai.com/v1/chat/completions",
          key: openaiKey as string,
          model: "gpt-4o-mini",
          lines,
          to,
        });
    return Response.json({ lines: translated });
  } catch {
    return Response.json({ lines });
  }
}

async function translateWithChat(opts: {
  url: string;
  key: string;
  model: string;
  lines: string[];
  to: string;
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
            "你是字幕翻譯。依目標語言翻譯每一句，語氣口語、長度接近原文。不增刪句數。輸出 JSON：{\"lines\":[\"...\"]}，長度必須與輸入相同。",
        },
        {
          role: "user",
          content: JSON.stringify({ to: opts.to, lines: opts.lines }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error("translate failed");
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "") as { lines?: unknown };
  if (!Array.isArray(parsed.lines) || parsed.lines.length !== opts.lines.length) {
    throw new Error("length mismatch");
  }
  return parsed.lines.map((line, index) => {
    const text = String(line ?? "").trim();
    return text || opts.lines[index] || "";
  }).map((line) => (opts.to.startsWith("zh") ? toTaiwanTraditional(line) : line));
}
