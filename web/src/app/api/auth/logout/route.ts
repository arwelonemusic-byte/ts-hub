import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

// POST only, so a cross-site link or prefetch can't log people out.
export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/events", request.url), 303);
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
