import type { NextRequest } from "next/server";
import { DEV_ROLES_COOKIE, DEV_VIEWER, DEV_VIEWER_COOKIE } from "@/lib/viewer";

/**
 * Dev only: `/api/dev/viewer?name=Prais777` makes pages act as that player (lib/viewer.ts);
 * `&roles=SL,Rifleman` sets their Discord roles (default: Rifleman).
 */
export async function GET(req: NextRequest) {
  if (!DEV_VIEWER) return new Response("Not found", { status: 404 });
  const name = req.nextUrl.searchParams.get("name")?.trim();
  const roles = req.nextUrl.searchParams.get("roles")?.trim();
  const to = req.headers.get("referer") ?? new URL("/events", req.url).toString();
  const cookie = name
    ? `${DEV_VIEWER_COOKIE}=${encodeURIComponent(name)}; Path=/; SameSite=Lax`
    : `${DEV_VIEWER_COOKIE}=; Path=/; Max-Age=0`;
  const rolesCookie = roles
    ? `${DEV_ROLES_COOKIE}=${encodeURIComponent(roles)}; Path=/; SameSite=Lax`
    : `${DEV_ROLES_COOKIE}=; Path=/; Max-Age=0`;
  const headers = new Headers({ Location: to });
  headers.append("Set-Cookie", cookie);
  headers.append("Set-Cookie", rolesCookie);
  return new Response(null, { status: 303, headers });
}
