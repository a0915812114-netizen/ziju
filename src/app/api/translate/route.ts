import { clientIp, isOwnerRequest } from "@/lib/access";
import {
  acceptAiLines,
  sanitizeLines,
  sanitizeTranslateTo,
  UNTRUSTED_CONTENT_RULE,
} from "@/lib/ai-guard";
import { consumeQuota, isSecureRequest, jsonWithCookie } from "@/lib/quota";
import { toTaiwanTraditional } from "@/lib/taiwan";

export const maxDuration = 30;

export async function POST(request: Request) {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!groqKey && !openaiKey) {
    return Response.json({ error: "NO_KEY", message: "出了點問題，請稍後再試。" }, { status: 401 });
  }

  const body = (await request.json()) as {
    lines?: unknown;
    to?: unknown;
  };
  const lines = sanitizeLines(body.lines);
  const to = sanitizeTranslateTo(body.to);
  if (lines.length === 0) return Response.json({ lines: [] });

  const owner = isOwnerRequest(request.headers.get("cookie"));
  const secure = isSecureRequest(request);
  let quotaCookieValue: string | null = null;
  if (!owner) {
    const quota = consumeQuota("chat", clientIp(request), request.headers.get("cookie"), secure);
    quotaCookieValue = quota.cookie;
    if (!quota.ok) {
      return jsonWithCookie(
        { error: "RATE_LIMITED", message: "今天的翻譯次數用完了。" },
        429,
        quotaCookieValue,
      );
    }
  }

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
    return jsonWithCookie({ lines: translated }, 200, quotaCookieValue);
  } catch {
    return jsonWithCookie(
      { error: "TRANSLATE_FAILED", message: "出了點問題，請稍後再試。", lines },
      500,
      quotaCookieValue,
    );
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
            "你是字幕翻譯。依目標語言翻譯每一句，語氣口語、長度接近原文。不增刪句數。輸出 JSON：{\"lines\":[\"...\"]}，長度必須與輸入相同。" +
            UNTRUSTED_CONTENT_RULE,
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
  const accepted = acceptAiLines(opts.lines, parsed.lines);
  if (!accepted) throw new Error("length mismatch");
  return accepted
    .map((line, index) => line || opts.lines[index] || "")
    .map((line) => (opts.to.startsWith("zh") ? toTaiwanTraditional(line) : line));
}
