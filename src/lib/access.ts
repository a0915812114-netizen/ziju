const COOKIE = "ziju_owner";
export const PUBLIC_DAILY = 5;
export const PUBLIC_CHAT_DAILY = 20;

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
