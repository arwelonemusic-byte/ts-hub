import { stat } from "node:fs/promises";
import path from "node:path";

/**
 * Fix and Flank lives in the repo at games/fix-and-flank (plain JS modules, no build step) and the hub serves
 * it as it is, under /games/fix-and-flank/ (app/games/fix-and-flank/[...path]). Its pages load everything by
 * relative URLs, so a page served at /games/fix-and-flank/play finds src/, assets/, vendor/ and data/ beside it.
 * The server runs from web/ (dev and the box), so the game is one level up.
 */
// turbopackIgnore: a folder of runtime files, not something for the build to trace.
export const GAME_DIR = path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "games", "fix-and-flank");

/** The game's pages by URL name. The game's own links say index.html and editor.html, so those work too. */
export const GAME_PAGES: Record<string, { file: string; members: boolean }> = {
  play: { file: "index.html", members: true },
  "index.html": { file: "index.html", members: true },
  editor: { file: "editor.html", members: true },
  "editor.html": { file: "editor.html", members: true },
  // The turning 3D map on a map's page: shown to everyone, like the page.
  preview: { file: "preview.html", members: false },
  "preview.html": { file: "preview.html", members: false },
};

/** Folders the pages load from. Nothing else in the game folder (tests, docs, tools) is served. */
const SERVED_DIRS = new Set(["src", "assets", "vendor", "data"]);

export const GAME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
};

/** The file a served URL path names, or null: only the pages and files in the served folders, never outside. */
export async function gameFile(parts: string[]): Promise<{ file: string; type: string; members: boolean } | null> {
  if (parts.length === 1 && GAME_PAGES[parts[0]]) {
    const page = GAME_PAGES[parts[0]];
    return { file: path.join(GAME_DIR, page.file), type: GAME_TYPES.html, members: page.members };
  }
  if (parts.length < 2 || !SERVED_DIRS.has(parts[0]) || parts.some((p) => !p || p === "." || p === ".." || p.includes("\\"))) return null;
  const file = path.join(GAME_DIR, ...parts);
  if (!file.startsWith(GAME_DIR + path.sep)) return null;
  const type = GAME_TYPES[path.extname(file).slice(1).toLowerCase()];
  if (!type) return null;
  try {
    return (await stat(file)).isFile() ? { file, type, members: false } : null;
  } catch {
    return null;
  }
}
