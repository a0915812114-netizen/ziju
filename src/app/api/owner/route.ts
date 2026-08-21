import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { clientIp, ownerCookie, ownerToken } from "@/lib/access";
import { consumeUnlockAttempt, isSecureRequest } from "@/lib/quota";

function sameToken(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function readToken(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    const body = (await request.json()) as { token?: unknown };
    return String(body.token ?? "").trim();
  }
  const form = await request.formData();
  return String(form.get("token") ?? "").trim();
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await consumeUnlockAttempt(ip))) {
    return NextResponse.json({ error: "RATE_LIMITED", message: "試太多次了，請稍後再試。" }, { status: 429 });
  }

  const expected = ownerToken();
  const token = await readToken(request);
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
  const home = new URL("/unlock", request.url);
  const studio = new URL("/studio", request.url);

  if (!expected || !sameToken(token, expected)) {
    if (wantsHtml) {
      home.searchParams.set("fail", "1");
      return NextResponse.redirect(home);
    }
    return NextResponse.json({ error: "FORBIDDEN", message: "解鎖失敗。" }, { status: 403 });
  }

  const secure = isSecureRequest(request);
  if (wantsHtml) {
    const res = NextResponse.redirect(studio);
    res.headers.append("Set-Cookie", ownerCookie(expected, secure));
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", ownerCookie(expected, secure));
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
