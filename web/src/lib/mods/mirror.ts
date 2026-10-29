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

/** The base game: every addon depends on it, and nobody downloads it. */
const BASE_GAME = "58D0FB3206B6F859";

export interface MirrorAddon {
  guid: string;
  /** `<Name>_<GUID>`, the folder's name in the archive and in the game's addons folder. */
  folder: string;
  name: string;
  version: string | null;
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

/** The addon as the box has it, or null when it isn't there (a folder without addon.gproj is a broken download). */
export async function readAddon(guid: string): Promise<MirrorAddon | null> {
  const folder = await folderOf(guid);
  if (!folder || !existsSync(path.join(ADDONS_DIR, folder, "addon.gproj"))) return null;
  let name = folder.slice(0, -guid.length - 1);
  let version: string | null = null;
  try {
    // `meta` is written by the server with a BOM.
    const meta = JSON.parse((await readFile(path.join(ADDONS_DIR, folder, "meta"), "utf8")).replace(/^\uFEFF/, ""));
    name = meta?.meta?.name || name;
    version = meta?.meta?.versions?.[0]?.version ?? null;
  } catch {
    // No readable meta: the folder name stands in for the name, and the version is unknown (so it counts as outdated).
  }
  return { guid, folder, name, version };
}

/**
 * The addon's dependencies from its addon.gproj. That's the authoritative list: the server-written `meta` has an
 * empty one (only the game client fills it).
 */
async function gprojDependencies(folder: string): Promise<string[]> {
  try {
    const text = await readFile(path.join(ADDONS_DIR, folder, "addon.gproj"), "utf8");
    const block = text.match(/Dependencies\s*\{([^}]*)\}/)?.[1] ?? "";
    return [...block.matchAll(/"([0-9A-Fa-f]{16})"/g)].map((m) => m[1].toUpperCase()).filter((g) => g !== BASE_GAME);
  } catch {
    return [];
  }
}

/** The addon and its whole dependency tree, breadth first; `null` for one the box doesn't have. */
export async function addonTree(guid: string): Promise<{ guid: string; addon: MirrorAddon | null }[]> {
  const order: { guid: string; addon: MirrorAddon | null }[] = [];
  const seen = new Set<string>();
  const queue = [guid];
  while (queue.length) {
    const g = queue.shift()!;
    if (seen.has(g)) continue;
    seen.add(g);
    const addon = await readAddon(g);
    order.push({ guid: g, addon });
    if (addon) queue.push(...(await gprojDependencies(addon.folder)));
  }
  return order;
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
