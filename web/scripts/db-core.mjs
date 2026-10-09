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
const SEED_PLAYED = path.join(ROOT, "db", "seed", "played-events.json");
const SEED_SCHEDULED = path.join(ROOT, "db", "seed", "scheduled-events.json");
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
 * Load the catalogue (db/seed/missions.json, built by data/catalogue/build_seed.py), the games
 * (db/seed/played-events.json and scheduled-events.json) and, when the member list is present, the
 * players. Missions and played games already in the database are left alone unless `update` — once
 * the hub edits them, the database is their source of truth. Scheduled games are only ever added:
 * their slots fill up in the hub.
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

  const games = await seedEvents(db, { update });
  return { players: playerCount, missions: missionCount, ...games };
}

/**
 * A seed's player: a Discord display name (exact; null when nobody or several have it), or
 * `{ name, discordId }` for someone the member list may lack (added as a player if so).
 */
async function playerFor(tx, who) {
  if (!who) return null;
  if (typeof who === "object") {
    const [row] = await tx.query(
      `INSERT INTO players (discord_id, display_name) VALUES ($1, $2)
       ON CONFLICT (discord_id) DO UPDATE SET discord_id = EXCLUDED.discord_id RETURNING id`,
      [who.discordId, who.name],
    );
    return row.id;
  }
  const rows = await tx.query("SELECT id FROM players WHERE display_name = $1", [who]);
  return rows.length === 1 ? rows[0].id : null;
}

const nameOf = (who) => (typeof who === "object" ? who.name : who);

async function seedEvents(db, { update }) {
  const played = existsSync(SEED_PLAYED) ? JSON.parse(await readFile(SEED_PLAYED, "utf8")) : [];
  const scheduled = existsSync(SEED_SCHEDULED) ? JSON.parse(await readFile(SEED_SCHEDULED, "utf8")) : [];
  /** Names the seed couldn't match to a player, for the caller to report. */
  const unmatched = [];
  let count = 0;
  await db.transaction(async (tx) => {
    for (const e of scheduled) {
      if ((await tx.query("SELECT 1 FROM events WHERE id = $1", [e.id])).length) continue;
      const pl = await playerFor(tx, e.platoonLeader);
      const host = await playerFor(tx, e.host);
      if (e.platoonLeader && !pl) unmatched.push(nameOf(e.platoonLeader));
      if (e.host && !host) unmatched.push(nameOf(e.host));
      await tx.query(
        `INSERT INTO events (id, mission_id, starts_at, extra, status, host_id, platoon_leader_id)
         VALUES ($1, $2, $3, $4, 'scheduled', $5, $6)`,
        [e.id, e.missionId, e.startsAt, !!e.extra, host, pl],
      );
      // The game's copy of the mission's slot template, then the slots already taken ("<group>/<role>" → player).
      await tx.query(
        `INSERT INTO event_slots (event_id, position, group_id, group_name, role, required_role)
         SELECT $1, position, group_id, group_name, role, required_role FROM mission_slots WHERE mission_id = $2`,
        [e.id, e.missionId],
      );
      for (const [key, who] of Object.entries(e.slots ?? {})) {
        const cut = key.indexOf("/");
        const player = await playerFor(tx, who);
        const name = nameOf(who);
        if (!player) unmatched.push(name);
        const hit = await tx.query(
          `UPDATE event_slots SET player_id = $4, player_name = $5, taken_at = NOW()
           WHERE event_id = $1 AND group_id = $2 AND role = $3 RETURNING position`,
          [e.id, key.slice(0, cut), key.slice(cut + 1), player, player ? null : name],
        );
        if (hit.length !== 1) throw new Error(`${e.id}: no slot "${key}" in ${e.missionId}'s template`);
      }
      count++;
    }
    for (const e of played) {
      const exists = (await tx.query("SELECT 1 FROM events WHERE id = $1", [e.id])).length > 0;
      if (exists && !update) continue;
      const pl = await playerFor(tx, e.platoonLeader);
      if (e.platoonLeader && !pl) unmatched.push(nameOf(e.platoonLeader));
      // A scheduled game that got played keeps its slots and host.
      await tx.query(
        `INSERT INTO events (id, mission_id, starts_at, extra, status, platoon_leader_id, started_at, ended_at,
                             plan_code, stats)
         VALUES ($1, $2, $3, $4, 'played', $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (id) DO UPDATE SET mission_id = $2, starts_at = $3, extra = $4, status = 'played',
           platoon_leader_id = COALESCE($5, events.platoon_leader_id), started_at = $6, ended_at = $7,
           plan_code = $8, stats = $9::jsonb, updated_at = NOW()`,
        [e.id, e.missionId, e.startsAt, !!e.extra, pl, e.startedAt, e.endedAt, e.planCode ?? null, e.stats],
      );
      await tx.query("DELETE FROM event_attendance WHERE event_id = $1", [e.id]);
      for (const name of e.attendance) {
        await tx.query("INSERT INTO event_attendance (event_id, player_name) VALUES ($1, $2)", [e.id, name]);
      }
      await tx.query("DELETE FROM event_replays WHERE event_id = $1", [e.id]);
      for (const [i, code] of e.replays.entries()) {
        await tx.query("INSERT INTO event_replays (replay_code, event_id, part) VALUES ($1, $2, $3)", [code, e.id, i + 1]);
      }
      count++;
    }
  });
  return { events: count, unmatched };
}
