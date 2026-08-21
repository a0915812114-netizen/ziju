import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { PUBLIC_CHAT_DAILY, PUBLIC_DAILY } from "@/lib/access";
import { getRedis } from "@/lib/redis";
import { MAX_MEDIA_MS } from "@/lib/upload-policy";

const COOKIE = "ziju_quota";
const WINDOW_MS = 24 * 60 * 60 * 1000;
const TRANSCRIBE_BURST = 8;
const CHAT_BURST = 12;
const BURST_MS = 60 * 1000;
export const QUOTA_MS_PER_UNIT = 10 * 60 * 1000;

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

function ipHash(ip: string) {
  return createHmac("sha256", secret()).update(ip).digest("hex").slice(0, 24);
}

export function unitsForAudioMs(ms: number) {
  return Math.max(1, Math.ceil(Math.max(0, ms) / QUOTA_MS_PER_UNIT));
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

async function redisCounts(ip: string): Promise<Counts | null> {
  const redis = getRedis();
  if (!redis) return null;
  const day = utcDay();
  const id = ipHash(ip);
  const [transcribe, chat] = await redis.mget<number[]>(
    `q:${day}:t:${id}`,
    `q:${day}:c:${id}`,
  );
  return {
    transcribe: Math.max(0, Number(transcribe) || 0),
    chat: Math.max(0, Number(chat) || 0),
    resetAt: Date.now() + WINDOW_MS,
  };
}

async function mergedCounts(ip: string, cookieHeader: string | null): Promise<Counts> {
  const now = Date.now();
  const mem = memoryCounts(ip, now);
  const cookie = readCookie(cookieHeader) ?? emptyCounts(now);
  const remote = (await redisCounts(ip)) ?? emptyCounts(now);
  return {
    transcribe: Math.max(mem.transcribe, cookie.transcribe, remote.transcribe),
    chat: Math.max(mem.chat, cookie.chat, remote.chat),
    resetAt: Math.max(mem.resetAt, cookie.resetAt, now + WINDOW_MS),
  };
}

export async function publicQuota(ip: string, cookieHeader: string | null) {
  const row = await mergedCounts(ip, cookieHeader);
  return {
    remaining: Math.max(0, PUBLIC_DAILY - row.transcribe),
    limit: PUBLIC_DAILY,
    chatRemaining: Math.max(0, PUBLIC_CHAT_DAILY - row.chat),
    state: row,
  };
}

async function consumeBurst(ip: string, kind: "transcribe" | "chat" | "unlock") {
  const limit = kind === "transcribe" ? TRANSCRIBE_BURST : kind === "chat" ? CHAT_BURST : 8;
  const redis = getRedis();
  const id = ipHash(ip);
  if (redis) {
    const key = `b:${kind}:${id}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.pexpire(key, BURST_MS);
    return n <= limit;
  }
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const row = bursts.get(key);
  if (!row || now >= row.resetAt) {
    bursts.set(key, { count: 1, resetAt: now + BURST_MS });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

export async function consumeUnlockAttempt(ip: string) {
  return consumeBurst(ip, "unlock");
}

export async function consumeQuota(
  kind: "transcribe" | "chat",
  ip: string,
  cookieHeader: string | null,
  secure: boolean,
  units = 1,
) {
  const limit = kind === "transcribe" ? PUBLIC_DAILY : PUBLIC_CHAT_DAILY;
  const add = Math.max(1, Math.floor(units));
  if (!(await consumeBurst(ip, kind))) {
    const row = await mergedCounts(ip, cookieHeader);
    return {
      ok: false as const,
      remaining: Math.max(0, limit - row[kind]),
      limit,
      cookie: quotaCookie(row, secure),
    };
  }
  const row = await mergedCounts(ip, cookieHeader);
  if (row[kind] + add > limit) {
    return {
      ok: false as const,
      remaining: Math.max(0, limit - row[kind]),
      limit,
      cookie: quotaCookie(row, secure),
    };
  }
  row[kind] += add;
  hits.set(ip, row);
  const redis = getRedis();
  if (redis) {
    const key = `q:${utcDay()}:${kind === "transcribe" ? "t" : "c"}:${ipHash(ip)}`;
    await redis.set(key, row[kind], { ex: 36 * 60 * 60 });
  }
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

export async function addTranscribeJobMs(jobId: string, addMs: number, exp: number, claimedUsedMs = 0) {
  const now = Date.now();
  const redis = getRedis();
  const ttl = Math.max(1000, exp - now);
  if (redis) {
    const key = `job:${jobId}`;
    const stored = Number((await redis.get<number>(key)) || 0);
    const used = Math.max(stored, claimedUsedMs) + Math.max(0, addMs);
    if (used > MAX_MEDIA_MS) return null;
    await redis.set(key, used, { px: ttl });
    return used;
  }
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
