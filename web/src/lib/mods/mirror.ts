import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/*
 * The box's own copy of Workshop mods, which members download from the hub (the server pill's «Скачать мод»).
 * The dedicated server fills it (lib/mods/download.ts) as `<HUB_MODS_DIR>/addons/<Name>_<GUID>/`: the same files
 * the game keeps in Documents\My Games\ArmaReforger\addons, so an unpacked archive counts as installed. It's its
 * own folder, never the live game server's: that server has its paks open, and the downloader patches in place.
 */
// turbopackIgnore: runtime folders, not something for the build to trace.
export const MODS_DIR = process.env.HUB_MODS_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "mods");
export const ADDONS_DIR = path.join(MODS_DIR, "addons");

/** The Arma Reforger Server install that does the downloading (Steam app 1874900, anonymous). */
const SERVER_DIR =
  process.env.REFORGER_SERVER_DIR ||
  (process.platform === "win32" ? "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Arma Reforger Server" : "");
export const SERVER_EXE = SERVER_DIR ? path.join(SERVER_DIR, process.platform === "win32" ? "ArmaReforgerServer.exe" : "ArmaReforgerServer") : "";

/** «Скачать мод» shows only where there's a server to download with. */
export const modsEnabled = () => !!SERVER_EXE && existsSync(SERVER_EXE);

export interface MirrorAddon {
  guid: string;
  /** `<Name>_<GUID>`, the folder's name in the archive and in the game's addons folder. */
  folder: string;
  name: string;
  version: string | null;
  /**
   * Every file its `meta` lists is downloaded and on disk at its size. A download cut short (cancelled, crashed)
   * leaves the folder with the new version in `meta`, a 0-byte addon.gproj and part of data.pak: not complete, and
   * the next run resumes it.
   */
  complete: boolean;
}

/** Where the box stands with an addon against the Workshop's latest version; `partial`: a download cut short. */
export type AddonState = "current" | "stale" | "partial" | "missing";

export function addonState(addon: MirrorAddon | null, latest: string | null): AddonState {
  if (!addon) return "missing";
  if (!addon.complete) return "partial";
  return !latest || addon.version === latest ? "current" : "stale";
}

export interface MirrorFile {
  /** Path inside the addon folder, with forward slashes. */
  rel: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

async function folderOf(guid: string): Promise<string | null> {
  let names: string[];
  try {
    names = await readdir(ADDONS_DIR);
  } catch {
    return null;
  }
  const suffix = `_${guid}`.toUpperCase();
  return names.find((n) => n.toUpperCase().endsWith(suffix)) ?? null;
}

interface MetaFile {
  name?: string;
  size?: number;
  isDownloaded?: boolean;
}

/** The addon as the box has it, or null when there's no folder for it. */
export async function readAddon(guid: string): Promise<MirrorAddon | null> {
  const folder = await folderOf(guid);
  if (!folder) return null;
  let name = folder.slice(0, -guid.length - 1);
  let version: string | null = null;
  let complete = false;
  try {
    // `meta` is written by the server with a BOM.
    const meta = JSON.parse((await readFile(path.join(ADDONS_DIR, folder, "meta"), "utf8")).replace(/^\uFEFF/, ""));
    name = meta?.meta?.name || name;
    const current = meta?.meta?.versions?.[0];
    version = current?.version ?? null;
    const files: MetaFile[] = current?.package?.files ?? [];
    complete = files.length > 0;
    for (const f of files) {
      if (!f.isDownloaded || !f.name) complete = false;
      else {
        const s = await stat(path.join(ADDONS_DIR, folder, f.name)).catch(() => null);
        if (!s || s.size !== f.size) complete = false;
      }
    }
  } catch {
    // No readable meta: name from the folder, version unknown, not complete (the server downloads it again).
  }
  return { guid, folder, name, version, complete };
}

/** Every file in the addon's folder. */
export async function addonFiles(addon: MirrorAddon): Promise<MirrorFile[]> {
  const root = path.join(ADDONS_DIR, addon.folder);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files: MirrorFile[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const abs = path.join(e.parentPath, e.name);
    const s = await stat(abs);
    files.push({ rel: path.relative(root, abs).split(path.sep).join("/"), abs, size: s.size, mtimeMs: s.mtimeMs });
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}
