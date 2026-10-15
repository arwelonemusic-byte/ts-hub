import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GAME_DIR } from "./files";

/**
 * The game's own rules, on the server: a map is checked and cleaned by the same code the editor and the game run
 * (games/fix-and-flank/src). Plain JS modules loaded at run time, not bundled: the build doesn't reach outside web/.
 */

type MapJson = Record<string, unknown> & { name?: string; width?: number; height?: number };
type Model = Record<string, unknown>;

interface GameRules {
  balance: unknown;
  parseMap(json: MapJson, balance: unknown): unknown;
  fromMapJson(json: MapJson): Model;
  toMapJson(m: Model, balance: unknown): MapJson;
  problems(m: Model, balance: unknown): string[];
  SIZE: { width: number; height: number };
}

let rules: Promise<GameRules> | null = null;

const load = (rel: string) => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(path.join(GAME_DIR, rel)).href);

function gameRules(): Promise<GameRules> {
  rules ??= (async () => {
    const [map, model, balance] = await Promise.all([
      load("src/sim/map.js"),
      load("src/editor/model.js"),
      readFile(path.join(GAME_DIR, "data", "balance.json"), "utf8").then(JSON.parse),
    ]);
    return { balance, parseMap: map.parseMap, fromMapJson: model.fromMapJson, toMapJson: model.toMapJson, problems: model.problems, SIZE: model.SIZE };
  })().catch((err) => {
    rules = null;
    throw err;
  });
  return rules;
}

export const NAME_MAX = 40;

/**
 * A map the editor sent, as the hub keeps it: read by the game (an error says why not), the right size, and written
 * back out by the editor's own code (so nothing but the map format is stored; the briefing is the editor's). With
 * `publish`, it must also be ready to play: what the editor's «Ready to play» checks.
 */
export async function cleanMap(input: unknown, name: string, { publish = false } = {}): Promise<{ json: MapJson } | { error: string }> {
  const r = await gameRules();
  const title = name.trim();
  if (!title) return { error: "Give the map a name." };
  if (title.length > NAME_MAX) return { error: `The name is longer than ${NAME_MAX} characters.` };
  if (!input || typeof input !== "object") return { error: "No map was sent." };
  const json = input as MapJson;
  if (json.width !== r.SIZE.width || json.height !== r.SIZE.height) return { error: `Maps are ${r.SIZE.width} x ${r.SIZE.height} hexes.` };
  try {
    r.parseMap(json, r.balance);
    const model = r.fromMapJson(json);
    model.name = title;
    if (publish) {
      const issues = r.problems(model, r.balance);
      if (issues.length) return { error: issues.join(" ") };
    }
    return { json: r.toMapJson(model, r.balance) };
  } catch (err) {
    return { error: `Not a map the game can read: ${(err as Error).message}` };
  }
}
