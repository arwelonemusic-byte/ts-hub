import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GAME_DIR } from "./files";
import { format, makeT } from "@/lib/i18n";

const t = makeT("ru"); // the game reads these, and the game is Russian only

/**
 * The game's own rules, on the server: a map is checked and cleaned by the same code the editor and the game run
 * (games/fix-and-flank/src). Plain JS modules loaded at run time, not bundled: the build doesn't reach outside web/.
 */

type MapJson = Record<string, unknown> & { name?: string; width?: number; height?: number };
type Model = Record<string, unknown>;

interface RunState {
  result: { winner: string; why: string } | null;
  turn: number;
}

interface GameRules {
  balance: unknown;
  /** A hash of what decides a game: the rules (src/sim), the AI (src/ai) and balance.json. */
  version: string;
  parseMap(json: MapJson, balance: unknown): unknown;
  playRun(run: { balance: unknown; map: unknown; seed: number; commits: unknown[] }): { state: RunState; used: number };
  readCommits(input: unknown): { commits: unknown[] } | { error: string };
  fromMapJson(json: MapJson): Model;
  toMapJson(m: Model, balance: unknown): MapJson;
  problems(m: Model, balance: unknown): string[];
  SIZE: { width: number; height: number };
}

let rules: Promise<GameRules> | null = null;

const load = (rel: string) => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(path.join(GAME_DIR, rel)).href);

function gameRules(): Promise<GameRules> {
  rules ??= (async () => {
    const [map, model, run, balanceText, version] = await Promise.all([
      load("src/sim/map.js"),
      load("src/editor/model.js"),
      load("src/ai/run.js"),
      readFile(path.join(GAME_DIR, "data", "balance.json"), "utf8"),
      rulesVersion(),
    ]);
    return {
      balance: JSON.parse(balanceText),
      version,
      parseMap: map.parseMap,
      playRun: run.playRun,
      readCommits: run.readCommits,
      fromMapJson: model.fromMapJson,
      toMapJson: model.toMapJson,
      problems: model.problems,
      SIZE: model.SIZE,
    };
  })().catch((err) => {
    rules = null;
    throw err;
  });
  return rules;
}

// The files a game's outcome depends on, hashed: a run keeps it, so a replay can say when the rules have changed since.
async function rulesVersion(): Promise<string> {
  const hash = createHash("sha256");
  for (const dir of ["src/sim", "src/ai"]) {
    for (const f of (await readdir(path.join(GAME_DIR, dir))).filter((x) => x.endsWith(".js")).sort()) {
      hash.update(`${dir}/${f}\n`).update(await readFile(path.join(GAME_DIR, dir, f)));
    }
  }
  hash.update(await readFile(path.join(GAME_DIR, "data", "balance.json")));
  return hash.digest("hex").slice(0, 12);
}

export async function gameVersion(): Promise<string> {
  return (await gameRules()).version;
}

/**
 * A run played through on the server, from the map, the seed and BLUFOR's commits as the browser sent them (the AI
 * plays OPFOR again): who won and on which turn. An error when the commits aren't a run or the game didn't end.
 */
export async function replayRun(mapJson: unknown, seed: number, commitsInput: unknown): Promise<{ result: "won" | "lost"; turns: number; commits: unknown[] } | { error: string }> {
  const r = await gameRules();
  const read = r.readCommits(commitsInput);
  if ("error" in read) return { error: read.error };
  try {
    const map = r.parseMap(mapJson as MapJson, r.balance);
    const { state, used } = r.playRun({ balance: r.balance, map, seed, commits: read.commits });
    if (!state.result) return { error: t("fnf.err.runNoEnd") };
    if (used !== read.commits.length) return { error: t("fnf.err.runAfterEnd") };
    return { result: state.result.winner === "BLUFOR" ? "won" : "lost", turns: state.turn, commits: read.commits };
  } catch (err) {
    return { error: format(t("fnf.err.runBroken"), { why: (err as Error).message }) };
  }
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
  if (!title) return { error: t("fnf.err.noName") };
  if (title.length > NAME_MAX) return { error: format(t("fnf.err.longName"), { max: NAME_MAX }) };
  if (!input || typeof input !== "object") return { error: t("fnf.err.noMap") };
  const json = input as MapJson;
  if (json.width !== r.SIZE.width || json.height !== r.SIZE.height) return { error: format(t("fnf.err.size"), { w: r.SIZE.width, h: r.SIZE.height }) };
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
    return { error: format(t("fnf.err.unreadable"), { why: (err as Error).message }) };
  }
}
