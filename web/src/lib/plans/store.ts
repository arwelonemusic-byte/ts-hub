import { randomBytes } from "node:crypto";
import { getDb, type Db } from "../db";

/**
 * A hub plan: the planner versions that belong together, plus who it's for.
 * Every push in the planner mints a new code; pushes made with this record's
 * `key` are versions of this plan, and the hub shows the newest one.
 * Stored in the `plans` table (db/migrations/001_core.sql).
 */
export interface PlanRecord {
  /** Public id, used in links. */
  id: string;
  missionId: string;
  /** The game this is the plan for («План» on its page); null = a mission plan. */
  eventId: string | null;
  /** That game's start: versions pushed after it don't count. */
  eventStartsAt: string | null;
  authorId: string;
  authorName: string;
  /** Secret the planner tags pushes with. Only the hub and the author's planner tab ever see it. */
  key: string;
  /** The version it started from («Использовать», or a code typed in), shown until the first push. */
  seed: { code: string; author: string; createdAt: string } | null;
  createdAt: string;
}

const iso = (d: unknown) => (d == null ? null : new Date(d as string | Date).toISOString());

function fromRow(r: Record<string, unknown>): PlanRecord {
  return {
    id: r.id as string,
    missionId: r.mission_id as string,
    eventId: (r.event_id as string | null) ?? null,
    eventStartsAt: iso(r.event_starts_at),
    authorId: r.author_discord_id as string,
    authorName: r.author_name as string,
    key: r.plan_key as string,
    seed: r.seed_code
      ? { code: r.seed_code as string, author: r.seed_author as string, createdAt: iso(r.seed_created_at)! }
      : null,
    createdAt: iso(r.created_at)!,
  };
}

/** Plans of a mission, or the plans of the given games. */
export async function listPlanRecords(where: { missionId?: string; eventIds?: string[] }): Promise<PlanRecord[]> {
  const db = await getDb();
  if (where.eventIds) {
    if (where.eventIds.length === 0) return [];
    return (await db.query("SELECT * FROM plans WHERE event_id = ANY($1::text[]) ORDER BY created_at", [where.eventIds])).map(fromRow);
  }
  return (await db.query("SELECT * FROM plans WHERE mission_id = $1 ORDER BY created_at", [where.missionId])).map(fromRow);
}

export async function getPlanRecord(id: string): Promise<PlanRecord | null> {
  const db = await getDb();
  const [row] = await db.query("SELECT * FROM plans WHERE id = $1", [id]);
  return row ? fromRow(row) : null;
}

export function newPlanRecord(fields: Omit<PlanRecord, "id" | "key" | "createdAt">): PlanRecord {
  return {
    ...fields,
    id: randomBytes(6).toString("base64url"),
    key: randomBytes(24).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
}

async function insert(db: Db, r: PlanRecord): Promise<void> {
  await db.query(
    `INSERT INTO plans (id, mission_id, event_id, event_starts_at, author_discord_id, author_name, plan_key,
                        seed_code, seed_author, seed_created_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [r.id, r.missionId, r.eventId, r.eventStartsAt, r.authorId, r.authorName, r.key,
     r.seed?.code ?? null, r.seed?.author ?? null, r.seed?.createdAt ?? null, r.createdAt],
  );
}

export async function insertPlanRecord(rec: PlanRecord): Promise<PlanRecord> {
  await insert(await getDb(), rec);
  return rec;
}

/**
 * A game's plan changes hands: the old one (if any) is demoted to a mission plan
 * (`keepOld`) or deleted, and `rec` takes its place — in one transaction.
 */
export async function replaceEventPlan(old: { id: string; keepOld: boolean } | null, rec: PlanRecord): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    if (old?.keepOld) await tx.query("UPDATE plans SET event_id = NULL, event_starts_at = NULL WHERE id = $1", [old.id]);
    else if (old) await tx.query("DELETE FROM plans WHERE id = $1", [old.id]);
    await insert(tx, rec);
  });
}
