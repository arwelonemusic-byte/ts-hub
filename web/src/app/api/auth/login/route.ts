import { NextResponse } from "next/server";
import { discordConfigured, getOAuthURL } from "@/lib/auth/discord";
import { cookieOptions, STATE_COOKIE } from "@/lib/auth/session";
import { siteUrl } from "@/lib/site";

export async function GET(request: Request) {
  if (!discordConfigured()) {
    return NextResponse.redirect(siteUrl("/events?auth=not_configured", request));
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getOAuthURL(state));
  res.cookies.set(STATE_COOKIE, state, cookieOptions(10 * 60));
  return res;
}
