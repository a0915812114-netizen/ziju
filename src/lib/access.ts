const COOKIE = "ziju_owner";
const PUBLIC_DAILY = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const hits = new Map<string, { count: number; resetAt: number }>();

export const MAX_TRANSCRIBE_BYTES = 4 * 1024 * 1024;

export function ownerToken() {
  return process.env.OWNER_TOKEN?.trim() || "";
}

export function isOwnerRequest(cookieHeader: string | null) {
  const token = ownerToken();
  if (!token) return false;
  const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return decodeURIComponent(match?.[1] ?? "") === token;
}

export function ownerCookie(token: string, secure: boolean) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 180}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function publicQuota(ip: string) {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now >= row.resetAt) {
    return { remaining: PUBLIC_DAILY, limit: PUBLIC_DAILY };
  }
  return { remaining: Math.max(0, PUBLIC_DAILY - row.count), limit: PUBLIC_DAILY };
}

export function consumePublicQuota(ip: string) {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now >= row.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: PUBLIC_DAILY - 1, limit: PUBLIC_DAILY };
  }
  if (row.count >= PUBLIC_DAILY) {
    return { ok: false, remaining: 0, limit: PUBLIC_DAILY };
  }
  row.count += 1;
  return { ok: true, remaining: PUBLIC_DAILY - row.count, limit: PUBLIC_DAILY };
}
