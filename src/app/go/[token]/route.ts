import { NextResponse } from "next/server";
import { ownerCookie, ownerToken } from "@/lib/access";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const expected = ownerToken();
  const studio = new URL("/studio", request.url);
  const home = new URL("/", request.url);

  if (!expected || token !== expected) {
    home.searchParams.set("unlock", "0");
    return NextResponse.redirect(home);
  }

  const secure = new URL(request.url).protocol === "https:";
  const res = NextResponse.redirect(studio);
  res.headers.append("Set-Cookie", ownerCookie(expected, secure));
  return res;
}
