import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { PUBLIC_CHAT_DAILY, PUBLIC_DAILY } from "@/lib/access";
import { MAX_MEDIA_MS } from "@/lib/upload-policy";

const COOKIE = "ziju_quota";
const WINDOW_MS = 24 * 60 * 60 * 1000;
const TRANSCRIBE_BURST = 8;
const CHAT_BURST = 12;
const BURST_MS = 60 * 1000;

type Counts = {
  transcribe: number;
  chat: number;
  resetAt: number;
};

const hits = new Map<string, Counts>();
const bursts = new Map<string, { count: number; resetAt: number }>();
const jobs = new Map<string, { usedMs: number; exp: number }>();

function secret() {
  return (
    process.env.QUOTA_SECRET ||
    process.env.OWNER_TOKEN ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "ziju-quota"
  );
}

function utcDay(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

function emptyCounts(now = Date.now()): Counts {
  return { transcribe: 0, chat: 0, resetAt: now + WINDOW_MS };
}

function readCookie(cookieHeader: string | null): Counts | null {
  const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const raw = decodeURIComponent(match?.[1] ?? "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      d?: string;
      t?: number;
      c?: number;
    };
    if (data.d !== utcDay()) return emptyCounts();
    return {
      transcribe: Math.max(0, Math.floor(Number(data.t) || 0)),
      chat: Math.max(0, Math.floor(Number(data.c) || 0)),
      resetAt: Date.now() + WINDOW_MS,
    };
  } catch {
    return null;
  }
}

export function quotaCookie(state: Counts, secure: boolean) {
  const payload = Buffer.from(
    JSON.stringify({
      d: utcDay(),
      t: state.transcribe,
      c: state.chat,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  const parts = [
    `${COOKIE}=${encodeURIComponent(`${payload}.${sig}`)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 36}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSecureRequest(request: Request) {
  if (new URL(request.url).protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
}

function memoryCounts(ip: string, now = Date.now()) {
  const row = hits.get(ip);
  if (!row || now >= row.resetAt) return emptyCounts(now);
  return row;
}

function mergedCounts(ip: string, cookieHeader: string | null): Counts {
  const now = Date.now();
  const mem = memoryCounts(ip, now);
  const cookie = readCookie(cookieHeader) ?? emptyCounts(now);
  return {
    transcribe: Math.max(mem.transcribe, cookie.transcribe),
    chat: Math.max(mem.chat, cookie.chat),
    resetAt: Math.max(mem.resetAt, cookie.resetAt, now + WINDOW_MS),
  };
}

export function publicQuota(ip: string, cookieHeader: string | null) {
  const row = mergedCounts(ip, cookieHeader);
  return {
    remaining: Math.max(0, PUBLIC_DAILY - row.transcribe),
    limit: PUBLIC_DAILY,
    chatRemaining: Math.max(0, PUBLIC_CHAT_DAILY - row.chat),
    state: row,
  };
}

function consumeBurst(ip: string, kind: "transcribe" | "chat") {
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const limit = kind === "transcribe" ? TRANSCRIBE_BURST : CHAT_BURST;
  const row = bursts.get(key);
  if (!row || now >= row.resetAt) {
    bursts.set(key, { count: 1, resetAt: now + BURST_MS });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

export function consumeQuota(
  kind: "transcribe" | "chat",
  ip: string,
  cookieHeader: string | null,
  secure: boolean,
) {
  const limit = kind === "transcribe" ? PUBLIC_DAILY : PUBLIC_CHAT_DAILY;
  if (!consumeBurst(ip, kind)) {
    const row = mergedCounts(ip, cookieHeader);
    return {
      ok: false as const,
      remaining: Math.max(0, limit - row[kind]),
      limit,
      cookie: quotaCookie(row, secure),
    };
  }
  const row = mergedCounts(ip, cookieHeader);
  if (row[kind] >= limit) {
    return {
      ok: false as const,
      remaining: 0,
      limit,
      cookie: quotaCookie(row, secure),
    };
  }
  row[kind] += 1;
  hits.set(ip, row);
  return {
    ok: true as const,
    remaining: Math.max(0, limit - row[kind]),
    limit,
    cookie: quotaCookie(row, secure),
  };
}

export function newTranscribeJobId() {
  return randomUUID();
}

export function addTranscribeJobMs(jobId: string, addMs: number, exp: number, claimedUsedMs = 0) {
  const now = Date.now();
  const prev = jobs.get(jobId);
  if (prev && prev.exp < now) jobs.delete(jobId);
  const used = Math.max(jobs.get(jobId)?.usedMs ?? 0, claimedUsedMs) + Math.max(0, addMs);
  if (used > MAX_MEDIA_MS) return null;
  jobs.set(jobId, { usedMs: used, exp });
  return used;
}

export function jsonWithCookie(data: unknown, status: number, cookie: string | null) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
}
