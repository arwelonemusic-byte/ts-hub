import { NextResponse } from "next/server";
import { clearedSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// POST only, so a cross-site link or prefetch can't log people out. The login is shared with the Training
// Portal, so this logs out of both.
export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/events", request.url), 303);
  res.cookies.set(SESSION_COOKIE_NAME, "", clearedSessionCookie());
  return res;
}
