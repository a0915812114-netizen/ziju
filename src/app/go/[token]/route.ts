import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { ownerCookie, ownerToken } from "@/lib/access";

type Ctx = { params: Promise<{ token: string }> };

function sameToken(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const expected = ownerToken();
  const studio = new URL("/studio", request.url);
  const home = new URL("/", request.url);

  if (!expected || !sameToken(token, expected)) {
    home.searchParams.set("unlock", "0");
    return NextResponse.redirect(home);
  }

  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const res = NextResponse.redirect(studio);
  res.headers.append("Set-Cookie", ownerCookie(expected, secure));
  return res;
}
