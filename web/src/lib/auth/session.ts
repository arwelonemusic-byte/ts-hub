import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/*
 * The Tactical Shift login, shared by TS Hub and the Training Portal (docs/shared-login.md): one HS256
 * cookie, `ts_auth`, set on the parent domain in production (AUTH_COOKIE_DOMAIN=tacticalshift.ru) and signed
 * with TS_AUTH_SECRET, the same value in both apps' env files. Log in on either site and both see you; log
 * out on either and both forget you. In dev the cookie stays on localhost. The portal's
 * src/lib/auth/session.ts has the same cookie, payload and options: change both together.
 */
export const SESSION_COOKIE_NAME = "ts_auth";
/** CSRF guard for the OAuth round-trip (this site only). */
export const STATE_COOKIE = "ts_hub_oauth_state";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export interface SessionPayload {
  userId: string;
  username: string;
  /** Server nickname, else global name, else username. */
  displayName: string;
  avatar: string | null;
  roles: string[];
}

const secret = () => new TextEncoder().encode(process.env.TS_AUTH_SECRET);

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .setIssuedAt()
    .sign(secret());
}

export async function getSession(): Promise<SessionPayload | null> {
  if (!process.env.TS_AUTH_SECRET) return null;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Host-only cookie options (the OAuth state). */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** The shared login cookie: on the parent domain when AUTH_COOKIE_DOMAIN is set. */
export const sessionCookieOptions = () => ({
  ...cookieOptions(SESSION_MAX_AGE),
  ...(process.env.AUTH_COOKIE_DOMAIN ? { domain: process.env.AUTH_COOKIE_DOMAIN } : {}),
});

/** Logging out: the same name, path and domain, expired — a cookie set on the parent domain only goes this way. */
export const clearedSessionCookie = () => ({ ...sessionCookieOptions(), maxAge: 0 });
