import { NextRequest, NextResponse } from "next/server";
import { avatarUrl, exchangeCode, fetchDiscordUser, fetchGuildMember, mapRoleIdsToNames } from "@/lib/auth/discord";
import { createSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions, STATE_COOKIE } from "@/lib/auth/session";
import { upsertPlayer } from "@/lib/players";

export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_BASE_URL!;
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${base}/events?auth=${reason}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state || state !== request.cookies.get(STATE_COOKIE)?.value) return fail("failed");

  try {
    const accessToken = await exchangeCode(code);
    const user = await fetchDiscordUser(accessToken);
    const member = await fetchGuildMember(accessToken);
    const displayName = member.nick ?? user.globalName ?? user.username;
    const avatar = avatarUrl(user.id, user.avatar);
    // Everyone who signs in gets a players row (slots and plans point at it).
    await upsertPlayer({ discordId: user.id, name: displayName, username: user.username, avatar }).catch((err) =>
      console.error("[ts-hub] player upsert:", err),
    );
    const token = await createSessionToken({
      userId: user.id,
      username: user.username,
      displayName,
      avatar,
      roles: mapRoleIdsToNames(member.roles),
    });
    const res = NextResponse.redirect(`${base}/events`);
    res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_IN_GUILD") return fail("not_in_guild");
    console.error("[ts-hub] OAuth callback error:", err);
    return fail("failed");
  }
}
