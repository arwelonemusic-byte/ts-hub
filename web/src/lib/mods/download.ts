import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ADDONS_DIR, MODS_DIR, SERVER_EXE } from "./mirror";

/*
 * The dedicated server as a headless Workshop downloader (the download-addon skill, validated 2026-09-01): it
 * downloads every mod in its config's `mods` and their dependencies on startup, into
 * `<-addonDownloadDir>/addons/`, byte-identical to the game client's copy. A mod already at the latest version is
 * left alone and an outdated one is delta-patched in place. We wait for "Required addons are ready to use." and kill
 * it before it loads a world. It's private and bound to loopback ports apart from the live game server's (2001/17777),
 * and it's killed by its own pid only: never by name, which would take the live server down with it.
 */
const PORT = 2101;
const A2S_PORT = 17877;
/** A vanilla scenario the throwaway server is told to host; it never gets that far. */
const SCENARIO = "{ECC61978EDCC2B5A}Missions/23_Campaign.conf";
const TIMEOUT_MS = 60 * 60_000;

const READY = /Required addons are ready to use/i;
const STARTED = /Addon Download started ([0-9A-F]{16}) - (.*)$/;
/** Every ~10 s: "  BACKEND      : Smokeables - Custom Gear Slots: [=========>__________] 45% 22/48 MB", then the speed. */
const PROGRESS = /BACKEND\s*:\s*(.+?): \[[=>_]*\] (\d+)% (\d+)\/(\d+) MB\s*$/;
const SPEED = /BACKEND\s*:\s*Download speed ([\d.]+) KB\/s/;
/** The server gives up on these; it retries a flaky line by itself ("Fragmentizer: Retrying …", "Curl error=…"). */
const FATAL = /Addon Download failed|Unable to download|Failed to download|asset .* not found|addons are not downloadable/i;
/**
 * The server's own errors. The first that isn't line noise says why it stopped: "Addon 0000000000000001 (Ghost
 * Network - RHS Bridge) - Addon has dependencies deleted from workshop.", or, when Bohemia's API didn't answer
 * (SSL connect errors, about every other start from a dev PC on 2026-10-29), "Failed to fetch addon details from
 * workshop API! Repeat later or try different mods." The latter is worth another run; a mod gone from the Workshop isn't.
 */
const BACKEND_ERROR = /BACKEND\s+\(E\)/;
const NOISE = /Fragmentizer|Curl error|Http Error|\[RestApi\]/i;
const GONE = /deleted from workshop|not found on workshop|not downloadable|asset .* not found/i;
const logText = (line: string) => line.replace(/^[\d:.]+\s+\w+\s*(?:\(\w\))?\s*:\s*/, "").trim();

/** `retry`: another run may well work (Bohemia's API didn't answer); not for a mod gone from the Workshop or a timeout. */
export type DownloadResult = { ok: true } | { ok: false; detail: string; retry: boolean };

/** What the server's log says as it goes. */
export interface DownloadEvents {
  started(guid: string, name: string): void;
  progress(name: string, percent: number, doneMb: number, totalMb: number): void;
  speed(kbPerSec: number): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function newestConsoleLog(profile: string): Promise<string | null> {
  const logs = path.join(profile, "logs");
  let dirs: string[];
  try {
    dirs = (await readdir(logs)).filter((d) => d.startsWith("logs_"));
  } catch {
    return null;
  }
  let best: { file: string; at: number } | null = null;
  for (const d of dirs) {
    const file = path.join(logs, d, "console.log");
    try {
      const at = (await stat(file)).mtimeMs;
      if (!best || at > best.at) best = { file, at };
    } catch {
      // That boot hasn't written its log yet.
    }
  }
  return best?.file ?? null;
}

function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
  } else {
    try {
      // Its own process group (spawned detached), so anything it started goes too.
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

/** Runs the server for `guids` (latest versions); `on` hears what it's downloading. */
export async function downloadAddons(guids: string[], on: DownloadEvents): Promise<DownloadResult> {
  const run = path.join(MODS_DIR, "run", String(Date.now()));
  const profile = path.join(run, "profile");
  await mkdir(profile, { recursive: true });
  await mkdir(ADDONS_DIR, { recursive: true });
  const config = path.join(run, "config.json");
  await writeFile(
    config,
    JSON.stringify(
      {
        bindAddress: "127.0.0.1",
        bindPort: PORT,
        publicAddress: "127.0.0.1",
        publicPort: PORT,
        a2s: { address: "127.0.0.1", port: A2S_PORT },
        game: {
          name: "TS Hub mod download (private)",
          password: "ts-hub-download-only",
          passwordAdmin: "ts-hub-download-only",
          scenarioId: SCENARIO,
          maxPlayers: 1,
          visible: false,
          crossPlatform: false,
          supportedPlatforms: ["PLATFORM_PC"],
          gameProperties: { battlEye: false, fastValidation: true },
          mods: guids.map((modId) => ({ modId, name: "", version: "" })),
        },
        operating: { disableCrashReporter: true },
      },
      null,
      2,
    ),
  );
  const args = ["-config", config, "-profile", profile, "-addonDownloadDir", MODS_DIR, "-addonTempDir", path.join(run, "tmp")];
  args.push("-maxFPS", "10", "-noThrow", "-disableCrashReporter");

  let spawnError: string | null = null;
  const child = spawn(SERVER_EXE, args, { cwd: path.dirname(SERVER_EXE), stdio: "ignore", detached: process.platform !== "win32" });
  child.on("error", (e) => (spawnError = e.message));
  const exited = new Promise<void>((r) => child.once("close", () => r()));

  let result: DownloadResult = { ok: false, detail: "timeout", retry: false };
  let firstError: string | null = null;
  const failed = (fallback: string): DownloadResult => {
    const detail = firstError ? logText(firstError) : fallback;
    return { ok: false, detail, retry: !GONE.test(detail) };
  };
  let seen = 0;
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < TIMEOUT_MS) {
      await sleep(1000);
      if (spawnError) {
        result = { ok: false, detail: spawnError, retry: false };
        break;
      }
      const log = await newestConsoleLog(profile);
      const lines = log ? (await readFile(/* turbopackIgnore: true */ log, "utf8").catch(() => "")).split(/\r?\n/) : [];
      // The last line may still be half-written: leave it for the next round.
      const done = lines.slice(seen, Math.max(seen, lines.length - 1));
      seen += done.length;
      firstError ??= done.find((l) => BACKEND_ERROR.test(l) && !NOISE.test(l)) ?? null;
      const fatal = done.find((l) => FATAL.test(l));
      if (fatal) {
        result = failed(logText(fatal));
        break;
      }
      for (const line of done) {
        let m: RegExpMatchArray | null;
        if ((m = line.match(STARTED))) on.started(m[1], m[2].trim());
        else if ((m = line.match(PROGRESS))) on.progress(m[1].trim(), Number(m[2]), Number(m[3]), Number(m[4]));
        else if ((m = line.match(SPEED))) on.speed(Number(m[1]));
      }
      if (done.some((l) => READY.test(l))) {
        result = { ok: true };
        break;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        result = failed(`the server exited (${child.exitCode ?? child.signalCode})`);
        break;
      }
    }
  } finally {
    kill(child);
    await Promise.race([exited, sleep(10_000)]);
    await rm(run, { recursive: true, force: true }).catch(() => {});
  }
  return result;
}
