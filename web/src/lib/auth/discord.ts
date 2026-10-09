/**
 * Discord OAuth — trimmed copy of the Training Portal's flow, plus an OAuth
 * `state` check. Steam login is planned alongside it; both end in the same session.
 */
const DISCORD_API = "https://discord.com/api/v10";

export function discordConfigured(): boolean {
  return !!(
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.DISCORD_GUILD_ID &&
    process.env.SESSION_SECRET &&
    process.env.NEXT_PUBLIC_BASE_URL
  );
}

const redirectUri = () => `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`;

export function getOAuthURL(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "identify guilds.members.read",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Failed to fetch Discord user: ${res.status}`);
  const d = await res.json();
  return { id: d.id, username: d.username, globalName: d.global_name ?? null, avatar: d.avatar };
}

/** Throws `NOT_IN_GUILD` for non-members. */
export async function fetchGuildMember(accessToken: string): Promise<{ roles: string[]; nick: string | null }> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) throw new Error("NOT_IN_GUILD");
  if (!res.ok) throw new Error(`Failed to fetch guild member: ${res.status}`);
  const d = await res.json();
  return { roles: d.roles ?? [], nick: d.nick ?? null };
}

/** DISCORD_ROLE_MAP = {"<role id>":"<name>"}; unknown ids are dropped. */
export function mapRoleIdsToNames(roleIds: string[]): string[] {
  let map: Record<string, string> = {};
  try {
    map = JSON.parse((process.env.DISCORD_ROLE_MAP ?? "{}").replace(/^﻿/, "").trim() || "{}");
  } catch {
    console.error("[ts-hub] DISCORD_ROLE_MAP is not valid JSON");
  }
  return roleIds.map((id) => map[id]).filter((n): n is string => !!n);
}

export function avatarUrl(userId: string, avatar: string | null): string | null {
  return avatar ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64` : null;
}
