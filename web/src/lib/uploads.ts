import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Files the hub stores itself (mission covers taken from the Workshop). They live outside the app
 * folder, so a deploy doesn't wipe them: HUB_UPLOADS_DIR on the box (/var/lib/ts-hub/uploads),
 * web/.data/uploads in dev. Served at /uploads/… by app/uploads (Caddy can serve the folder
 * directly instead). Names carry a content hash, so a URL never changes what it shows.
 */
export const UPLOADS_DIR = process.env.HUB_UPLOADS_DIR || path.join(process.cwd(), ".data", "uploads");
const URL_PREFIX = "/uploads/";

export const UPLOAD_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Saves `bytes` as `<dir>/<base>-<hash>.<ext>`; returns its URL. */
export async function saveUpload(dir: "covers", base: string, bytes: Uint8Array, ext: keyof typeof UPLOAD_TYPES): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const name = `${base}-${hash}.${ext}`;
  await mkdir(path.join(UPLOADS_DIR, dir), { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, dir, name), bytes);
  return `${URL_PREFIX}${dir}/${name}`;
}

/** The file behind an /uploads URL (or its path segments); null for anything outside the folder. */
export function uploadPath(urlOrParts: string | string[]): string | null {
  const parts = typeof urlOrParts === "string" ? (urlOrParts.startsWith(URL_PREFIX) ? urlOrParts.slice(URL_PREFIX.length).split("/") : null) : urlOrParts;
  if (!parts?.length || parts.some((p) => !p || p === "." || p === ".." || /[\\:]/.test(p))) return null;
  const file = path.resolve(UPLOADS_DIR, ...parts);
  return file.startsWith(path.resolve(UPLOADS_DIR) + path.sep) ? file : null;
}

/** Best-effort removal of a file the hub stored (a replaced or deleted mission's cover). */
export async function removeUpload(url: string | null): Promise<void> {
  const file = url ? uploadPath(url) : null;
  if (file) await unlink(file).catch(() => {});
}
