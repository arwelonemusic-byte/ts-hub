import { cookies } from "next/headers";
import { discordConfigured } from "./auth/discord";
import { getSession } from "./auth/session";
import { getDb } from "./db";

/** Who is looking at the page: the signed-in Discord user. */
export interface Viewer {
  discordId: string;
  name: string;
  avatar: string | null;
  /** Discord role names (DISCORD_ROLE_MAP), as of login. */
  roles: string[];
  isAdmin: boolean;
  /** @mission officer: adds missions to the catalogue and edits their own. */
  isMissionMaker: boolean;
  /** A dev stand-in, not a real login (see below). */
  dev?: boolean;
}

/** Role names compare without case or spaces: the role map says "MachineGunner", slot templates "Machine Gunner". */
const roleKey = (r: string) => r.toLowerCase().replace(/[\s_-]+/g, "");

export function hasRole(viewer: Viewer, role: string): boolean {
  return viewer.roles.some((r) => roleKey(r) === roleKey(role));
}

const MISSION_MAKER_ROLE = "mission officer";

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
/** Hub admins: Discord role names (via DISCORD_ROLE_MAP) and/or Discord user IDs. */
const ADMIN_ROLES = list(process.env.HUB_ADMIN_ROLES);
const ADMIN_IDS = list(process.env.HUB_ADMIN_IDS);

/**
 * On a dev machine without Discord OAuth configured, pages act as if a player
 * from the players table were signed in, so write flows can be tried locally.
 * Galaxy by default; switch with /api/dev/viewer?name=<display name>.
 */
export const DEV_VIEWER = process.env.NODE_ENV !== "production" && !discordConfigured();
export const DEV_VIEWER_COOKIE = "ts_hub_dev_viewer";
/** Comma-separated role names for the stand-in (`/api/dev/viewer?name=…&roles=SL,Rifleman`). */
export const DEV_ROLES_COOKIE = "ts_hub_dev_roles";
/** A plain member's roles, when the dev link doesn't say. */
const DEV_DEFAULT_ROLES = ["Rifleman"];
const DEV_DEFAULT = "Galaxy";
const DEV_ADMINS = new Set(["Galaxy"]);

async function devViewer(): Promise<Viewer | null> {
  const jar = await cookies();
  const raw = jar.get(DEV_VIEWER_COOKIE)?.value;
  const rolesRaw = jar.get(DEV_ROLES_COOKIE)?.value;
  const roles = rolesRaw ? list(decodeURIComponent(rolesRaw)) : DEV_DEFAULT_ROLES;
  let name = DEV_DEFAULT;
  try {
    if (raw) name = decodeURIComponent(raw);
  } catch {
    // Not percent-encoded after all: keep the default.
  }
  // Not a member (or players not seeded): the stand-in still works, just without an id or avatar.
  const [m] = await (await getDb()).query("SELECT discord_id, avatar_url FROM players WHERE display_name = $1 LIMIT 1", [name]);
  return {
    discordId: m?.discord_id ?? `dev:${name}`,
    name,
    avatar: m?.avatar_url ?? null,
    roles,
    isAdmin: DEV_ADMINS.has(name),
    isMissionMaker: roles.some((r) => roleKey(r) === roleKey(MISSION_MAKER_ROLE)),
    dev: true,
  };
}

export async function getViewer(): Promise<Viewer | null> {
  const session = await getSession();
  if (session) {
    return {
      discordId: session.userId,
      name: session.displayName,
      avatar: session.avatar,
      roles: session.roles,
      isAdmin: ADMIN_IDS.includes(session.userId) || session.roles.some((r) => ADMIN_ROLES.includes(r)),
      isMissionMaker: session.roles.some((r) => roleKey(r) === roleKey(MISSION_MAKER_ROLE)),
    };
  }
  return DEV_VIEWER ? devViewer() : null;
}
