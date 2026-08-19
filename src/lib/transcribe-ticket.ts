import { createHmac, timingSafeEqual } from "crypto";

function secret() {
  return (
    process.env.GROQ_API_KEY ||
    process.env.OWNER_TOKEN ||
    process.env.OPENAI_API_KEY ||
    "ziju-ticket"
  );
}

export function issueTranscribeTicket(ip: string) {
  const exp = Date.now() + 25 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ ip, exp })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTranscribeTicket(ticket: string, ip: string) {
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  if (!timingSafeEqual(left, right)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      ip: string;
      exp: number;
    };
    return data.ip === ip && data.exp > Date.now();
  } catch {
    return false;
  }
}
