import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Same shape and HS256 cookie as the Training Portal (lib/auth/session.ts there).
export const SESSION_COOKIE_NAME = "ts_hub_session";
/** CSRF guard for the OAuth round-trip. */
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

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .setIssuedAt()
    .sign(getSecret());
}

export async function getSession(): Promise<SessionPayload | null> {
  if (!process.env.SESSION_SECRET) return null;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export const sessionCookieOptions = () => cookieOptions(SESSION_MAX_AGE);
