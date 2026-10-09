// Database access shared by the app (src/lib/db) and the CLI (scripts/db.mjs).
// Production: the box's PostgreSQL via DATABASE_URL. Dev without DATABASE_URL:
// PGlite (Postgres compiled to WASM) in web/.data/pglite — nothing to install.
// Paths are relative to web/, the working directory of next and the scripts.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const MIGRATIONS = path.join(ROOT, "db", "migrations");
const SEED_MISSIONS = path.join(ROOT, "db", "seed", "missions.json");
const CATALOGUE = path.join(ROOT, "data", "catalogue");
/** Member list for the players table. Not in git (member data), so seeding players is optional. */
export const MEMBERS_FILE = path.join(ROOT, "data", "players", "discord-members.json");

/**
 * @typedef {object} Db
 * @property {(text: string, params?: unknown[]) => Promise<any[]>} query  One statement, $1-style params.
 * @property {(text: string) => Promise<void>} exec  Several statements, no params (migrations).
 * @property {<T>(fn: (tx: Db) => Promise<T>) => Promise<T>} transaction
 * @property {() => Promise<void>} close
 */

/** @returns {Promise<Db>} */
export async function openDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { onnotice: () => {} });
    /** @returns {Db} */
    const wrap = (s) => ({
      query: (text, params = []) => s.unsafe(text, params),
      exec: async (text) => {
        await s.unsafe(text).simple();
      },
      transaction: (fn) => s.begin((tx) => fn(wrap(tx))),
      close: () => s.end(),
    });
    return wrap(sql);
  }
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is not set");
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(process.cwd(), ".data", "pglite");
  await mkdir(dir, { recursive: true });
  const pg = await PGlite.create(dir);
  /** @returns {Db} */
  const wrap = (c) => ({
    query: async (text, params = []) => (await c.query(text, params)).rows,
    exec: async (text) => {
      await c.exec(text);
    },
    transaction: (fn) => c.transaction((tx) => fn(wrap(tx))),
    close: () => c.close(),
  });
  return wrap(pg);
}

/** Apply db/migrations/*.sql not yet recorded in schema_migrations, in name order. Returns their names. */
export async function migrate(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const done = new Set((await db.query("SELECT name FROM schema_migrations")).map((r) => r.name));
  const applied = [];
  for (const name of (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    const text = await readFile(path.join(MIGRATIONS, name), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(text);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    applied.push(name);
  }
  return applied;
}

/**
 * Load the catalogue (db/seed/missions.json, built by data/catalogue/build_seed.py) and, when the
 * member list is present, the players. Missions already in the database are left alone unless
 * `update` — once the hub edits missions, the database is their source of truth.
 */
export async function seed(db, { update = false, players = MEMBERS_FILE } = {}) {
  let playerCount = 0;
  if (players && existsSync(players)) {
    const list = JSON.parse(await readFile(players, "utf8")).players ?? [];
    await db.transaction(async (tx) => {
      for (const p of list) {
        await tx.query(
          `INSERT INTO players (discord_id, display_name, username, avatar_url, member_since)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (discord_id) DO UPDATE SET display_name = $2, username = $3, avatar_url = $4, member_since = $5`,
          [p.discordId, p.displayName, p.username ?? null, p.avatarUrl ?? null, p.memberSince ?? null],
        );
      }
    });
    playerCount = list.length;
  }

  const missions = JSON.parse(await readFile(SEED_MISSIONS, "utf8"));
  let missionCount = 0;
  await db.transaction(async (tx) => {
    for (const m of missions) {
      const exists = (await tx.query("SELECT 1 FROM missions WHERE id = $1", [m.id])).length > 0;
      if (exists && !update) continue;
      const layer = m.markersLayer ? await readFile(path.join(CATALOGUE, m.markersLayer), "utf8") : null;
      const row = [
        m.id, m.name, m.mapKey, m.mapLabel, m.coverUrl ?? null, m.workshopUrl ?? null, m.addonGuid ?? null,
        // Objects, not JSON strings: the postgres driver JSON-encodes jsonb params itself (a string
        // would be stored double-encoded — the planner hit this).
        m.scenarioId ?? null, m.briefing ?? null, m.tags ?? [], layer,
        m.planning !== false, !!m.noSlotting,
      ];
      await tx.query(
        `INSERT INTO missions (id, name, map_key, map_label, cover_url, workshop_url, addon_guid, scenario_id,
                               briefing, tags, markers_layer, planning, no_slotting)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::text[], $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET name = $2, map_key = $3, map_label = $4, cover_url = $5, workshop_url = $6,
           addon_guid = $7, scenario_id = $8, briefing = $9::jsonb, tags = $10::text[], markers_layer = $11,
           planning = $12, no_slotting = $13, updated_at = NOW()`,
        row,
      );
      await tx.query("DELETE FROM mission_authors WHERE mission_id = $1", [m.id]);
      for (const [i, a] of (m.authors ?? []).entries()) {
        await tx.query("INSERT INTO mission_authors (mission_id, position, discord_id, name) VALUES ($1, $2, $3, $4)", [
          m.id, i, a.discordId ?? null, a.name,
        ]);
      }
      await tx.query("DELETE FROM mission_slots WHERE mission_id = $1", [m.id]);
      let pos = 0;
      for (const sq of m.squads ?? []) {
        for (const s of sq.slots) {
          await tx.query(
            `INSERT INTO mission_slots (mission_id, position, group_id, group_name, role, required_role)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [m.id, pos++, sq.groupId, sq.name, s.role, s.requiredRole ?? null],
          );
        }
      }
      missionCount++;
    }
  });
  return { players: playerCount, missions: missionCount };
}
