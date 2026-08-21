import { createHmac, timingSafeEqual } from "crypto";

function secret() {
  return (
    process.env.QUOTA_SECRET ||
    process.env.GROQ_API_KEY ||
    process.env.OWNER_TOKEN ||
    process.env.OPENAI_API_KEY ||
    "ziju-ticket"
  );
}

export function issueTranscribeTicket(
  ip: string,
  jobId: string,
  usedMs: number,
  billedUnits: number,
) {
  const exp = Date.now() + 25 * 60 * 1000;
  const payload = Buffer.from(
    JSON.stringify({ ip, exp, jobId, usedMs, billedUnits }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTranscribeTicket(ticket: string, ip: string) {
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return null;
  if (!timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      ip: string;
      exp: number;
      jobId?: string;
      usedMs?: number;
      billedUnits?: number;
    };
    if (data.ip !== ip || data.exp <= Date.now() || !data.jobId) return null;
    return {
      jobId: data.jobId,
      usedMs: Math.max(0, Number(data.usedMs) || 0),
      billedUnits: Math.max(1, Math.floor(Number(data.billedUnits) || 1)),
      exp: data.exp,
    };
  } catch {
    return null;
  }
}
