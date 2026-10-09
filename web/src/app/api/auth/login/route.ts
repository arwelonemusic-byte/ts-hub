import { NextResponse } from "next/server";
import { discordConfigured, getOAuthURL } from "@/lib/auth/discord";
import { cookieOptions, STATE_COOKIE } from "@/lib/auth/session";

export async function GET(request: Request) {
  if (!discordConfigured()) {
    return NextResponse.redirect(new URL("/events?auth=not_configured", request.url));
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getOAuthURL(state));
  res.cookies.set(STATE_COOKIE, state, cookieOptions(10 * 60));
  return res;
}
