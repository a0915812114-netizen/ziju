import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { clientIp, ownerToken } from "@/lib/access";
import { consumeUnlockAttempt } from "@/lib/quota";

type Ctx = { params: Promise<{ token: string }> };

function sameToken(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export async function GET(request: Request, ctx: Ctx) {
  const ip = clientIp(request);
  if (!(await consumeUnlockAttempt(ip))) {
    const home = new URL("/unlock", request.url);
    home.searchParams.set("fail", "1");
    return NextResponse.redirect(home);
  }

  const { token } = await ctx.params;
  const expected = ownerToken();
  const home = new URL("/unlock", request.url);
  home.searchParams.set("fail", "1");

  if (!expected || !sameToken(token, expected)) {
    return NextResponse.redirect(home);
  }

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <title>字句</title>
</head>
<body>
  <p>正在進入主人模式…</p>
  <form id="f" method="post" action="/api/owner" referrerpolicy="no-referrer">
    <input type="hidden" name="token" value="${escapeAttr(token)}">
  </form>
  <script>document.getElementById("f").submit()</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
