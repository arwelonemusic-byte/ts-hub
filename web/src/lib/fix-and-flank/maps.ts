import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { makeT } from "@/lib/i18n";
import { cleanMap } from "./rules";

const t = makeT("ru"); // the game reads these, and the game is Russian only

/**
 * Members' maps in the hub (fnf_maps), written by the game's editor through /api/games/fix-and-flank/maps.
 * A draft is its author's: saved as often as they like, deleted when they like. Publishing locks it for good
 * (user decision 2026-10-15): an edit would void its runs and record, so nothing below changes a published map.
 */

export type Outcome<T> = { ok: T } | { error: string; status: number };

export interface MineRow {
  id: string;
  name: string;
  status: "draft" | "published";
  updatedAt: string;
  publishedAt: string | null;
}

const THUMB_PREFIX = "data:image/jpeg;base64,";
const THUMB_MAX_BYTES = 600_000;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// Map ids are made from the name: Latin letters, so Cyrillic names are spelled out.
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
function newId(name: string): string {
  const base = [...name.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return `${base || "map"}-${randomBytes(2).toString("hex")}`;
}

/** The still the editor took (a JPEG data URL), as bytes; null when none was sent; "bad" when it isn't one. */
function thumbBytes(thumb: unknown): Uint8Array | null | "bad" {
  if (thumb === undefined || thumb === null) return null;
  if (typeof thumb !== "string" || !thumb.startsWith(THUMB_PREFIX)) return "bad";
  const bytes = Buffer.from(thumb.slice(THUMB_PREFIX.length), "base64");
  return bytes.length > 0 && bytes.length <= THUMB_MAX_BYTES ? bytes : "bad";
}

async function storeThumb(id: string, thumb: unknown, old: string | null): Promise<Outcome<string | null>> {
  const bytes = thumbBytes(thumb);
  if (bytes === "bad") return { error: t("fnf.err.thumb"), status: 400 };
  if (!bytes) return { ok: old };
  const url = await saveUpload("fnf", id, bytes, "jpg");
  if (old && old !== url && old.startsWith("/uploads/")) await removeUpload(old);
  return { ok: url };
}

/** The author's maps for the editor's Maps menu: drafts first, then published, newest first in each. */
export async function listMine(playerId: string): Promise<MineRow[]> {
  const db = await getDb();
  const rows = await db.query(
    `SELECT id, name, updated_at, published_at FROM fnf_maps WHERE author_id = $1 AND hidden_at IS NULL
     ORDER BY (published_at IS NULL) DESC, COALESCE(published_at, updated_at) DESC`,
    [playerId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.published_at ? "published" : "draft",
    updatedAt: iso(r.updated_at)!,
    publishedAt: iso(r.published_at),
  }));
}

interface MapInput {
  name?: unknown;
  json?: unknown;
  thumb?: unknown;
}

export async function createDraft(playerId: string, input: MapInput): Promise<Outcome<{ id: string }>> {
  const clean = await cleanMap(input.json, String(input.name ?? ""));
  if ("error" in clean) return { error: clean.error, status: 400 };
  const db = await getDb();
  for (let tries = 0; tries < 3; tries++) {
    const id = newId(String(clean.json.name));
    const thumb = await storeThumb(id, input.thumb, null);
    if ("error" in thumb) return thumb;
    const rows = await db.query(
      `INSERT INTO fnf_maps (id, author_id, name, json, thumb_url) VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, playerId, clean.json.name, JSON.stringify(clean.json), thumb.ok],
    );
    if (rows.length) return { ok: { id } };
  }
  return { error: t("fnf.err.noId"), status: 500 };
}

/** The author's draft, or why not. */
async function ownDraft(id: string, playerId: string): Promise<Outcome<{ thumbUrl: string | null }>> {
  const db = await getDb();
  const [row] = await db.query(`SELECT author_id, published_at, thumb_url FROM fnf_maps WHERE id = $1 AND hidden_at IS NULL`, [id]);
  if (!row || String(row.author_id) !== String(playerId)) return { error: t("fnf.err.noDraft"), status: 404 };
  if (row.published_at) return { error: t("fnf.err.locked"), status: 409 };
  return { ok: { thumbUrl: row.thumb_url } };
}

export async function saveDraft(id: string, playerId: string, input: MapInput): Promise<Outcome<{ id: string }>> {
  const own = await ownDraft(id, playerId);
  if ("error" in own) return own;
  const clean = await cleanMap(input.json, String(input.name ?? ""));
  if ("error" in clean) return { error: clean.error, status: 400 };
  const thumb = await storeThumb(id, input.thumb, own.ok.thumbUrl);
  if ("error" in thumb) return thumb;
  const db = await getDb();
  await db.query(
    `UPDATE fnf_maps SET name = $3, json = $4::jsonb, thumb_url = $5, updated_at = NOW() WHERE id = $1 AND author_id = $2 AND published_at IS NULL`,
    [id, playerId, clean.json.name, JSON.stringify(clean.json), thumb.ok],
  );
  return { ok: { id } };
}

/** Saves the draft one last time and publishes it: ready to play, or not at all. */
export async function publishMap(id: string, playerId: string, input: MapInput): Promise<Outcome<{ id: string }>> {
  const own = await ownDraft(id, playerId);
  if ("error" in own) return own;
  const clean = await cleanMap(input.json, String(input.name ?? ""), { publish: true });
  if ("error" in clean) return { error: clean.error, status: 400 };
  const thumb = await storeThumb(id, input.thumb, own.ok.thumbUrl);
  if ("error" in thumb) return thumb;
  const db = await getDb();
  const rows = await db.query(
    `UPDATE fnf_maps SET name = $3, json = $4::jsonb, thumb_url = $5, updated_at = NOW(), published_at = NOW()
     WHERE id = $1 AND author_id = $2 AND published_at IS NULL RETURNING id`,
    [id, playerId, clean.json.name, JSON.stringify(clean.json), thumb.ok],
  );
  return rows.length ? { ok: { id } } : { error: t("fnf.err.published"), status: 409 };
}

export async function deleteDraft(id: string, playerId: string): Promise<Outcome<{ id: string }>> {
  const own = await ownDraft(id, playerId);
  if ("error" in own) return own;
  const db = await getDb();
  await db.query(`DELETE FROM fnf_maps WHERE id = $1 AND author_id = $2 AND published_at IS NULL`, [id, playerId]);
  if (own.ok.thumbUrl?.startsWith("/uploads/")) await removeUpload(own.ok.thumbUrl);
  return { ok: { id } };
}
