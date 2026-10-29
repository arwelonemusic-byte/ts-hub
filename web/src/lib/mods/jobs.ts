import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";
import { fetchWorkshopAsset } from "../missions/workshop";
import { downloadAddons, type DownloadEvents } from "./download";
import { addonFiles, addonTree, MODS_DIR, readAddon } from "./mirror";
import type { ZipEntry } from "./zip";

/*
 * «Скачать мод» (the server pill): a member pastes a Workshop link, the box makes sure it has the mod and its
 * dependencies at their latest versions, and the member downloads them as one zip to unpack into the game's addons
 * folder. Mods the box already has at the Workshop's latest version are served as they are; otherwise the dedicated
 * server downloads (or delta-patches) them first. A POC: jobs live in memory, one at a time, and the copy only grows.
 *
 * Downloads and archives share the folder: the server patches files in place, so it waits until no archive is being
 * sent, and no archive starts while it runs.
 */

export type ModPhase = "checking" | "queued" | "waiting" | "downloading" | "preparing" | "ready" | "failed";
export type ModError = "notFound" | "unreachable" | "downloadFailed" | "missing";

export interface ModAddon {
  guid: string;
  name: string;
  version: string | null;
  /** Bytes in the archive. */
  size: number;
  requested: boolean;
  /** A dependency the box couldn't get: it isn't in the archive. */
  missing: boolean;
}

/** What the dialog shows; also the job's state. */
export interface ModStatus {
  guid: string;
  name: string | null;
  version: string | null;
  phase: ModPhase;
  /** Seconds in the current phase. */
  elapsed: number;
  /** While downloading: the addons the server has started on, in order. */
  downloading: string[];
  /** The addon being downloaded, as the server's log last put it (every ~10 s). */
  current: { name: string; percent: number; doneMb: number; totalMb: number } | null;
  /** KB/s, from the same log. */
  speed: number | null;
  addons: ModAddon[];
  error: ModError | null;
  /** The server's log line when a download failed. */
  detail: string | null;
  /** Why an archive can't start right now: the server is downloading, or enough archives are being sent. */
  busy: "updating" | "full" | null;
}

interface Job extends Omit<ModStatus, "elapsed" | "busy"> {
  since: number;
  finishedAt: number | null;
}

/** A ready job is reused this long; after that the next request asks the Workshop again. */
const READY_FOR_MS = 10 * 60_000;
/** Archives sent at once, each at most MODS_RATE_MBIT (the game server shares the box's 1 Gbit/s). */
const MAX_STREAMS = 3;
export const STREAM_BYTES_PER_SEC = (Number(process.env.HUB_MODS_RATE_MBIT) || 200) * 125_000;
/** Server runs per job when Bohemia's API doesn't answer. */
const DOWNLOAD_ATTEMPTS = 3;
const BASE_GAME = "58D0FB3206B6F859";

type Store = {
  jobs: Map<string, Job>;
  queue: Promise<unknown>;
  readers: number;
  writer: boolean;
  crc: Map<string, number> | null;
  crcPending: Map<string, Promise<number>>;
  /** New CRCs not yet in crc.json. */
  crcDirty: boolean;
};
const g = globalThis as unknown as { __tsHubMods?: Store };
const store = (g.__tsHubMods ??= {
  jobs: new Map(),
  queue: Promise.resolve(),
  readers: 0,
  writer: false,
  crc: null,
  crcPending: new Map(),
  crcDirty: false,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One job at a time touches the folder (download, then CRCs). */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = store.queue.then(fn, fn);
  store.queue = next.catch(() => {});
  return next;
}

/** Starts an archive; false with the reason when it can't start now. `release` must run when it ends. */
export function acquireArchive(): true | "updating" | "full" {
  if (store.writer) return "updating";
  if (store.readers >= MAX_STREAMS) return "full";
  store.readers++;
  return true;
}

export function releaseArchive() {
  store.readers = Math.max(0, store.readers - 1);
}

function busy(): ModStatus["busy"] {
  if (store.writer) return "updating";
  return store.readers >= MAX_STREAMS ? "full" : null;
}

function status(job: Job): ModStatus {
  return {
    guid: job.guid,
    name: job.name,
    version: job.version,
    phase: job.phase,
    elapsed: Math.round((Date.now() - job.since) / 1000),
    downloading: job.downloading,
    current: job.current,
    speed: job.speed,
    addons: job.addons,
    error: job.error,
    detail: job.detail,
    busy: busy(),
  };
}

function setPhase(job: Job, phase: ModPhase) {
  job.phase = phase;
  job.since = Date.now();
}

export function modStatus(guid: string): ModStatus | null {
  const job = store.jobs.get(guid);
  return job ? status(job) : null;
}

/** Starts (or joins) the job for `guid`. */
export function requestMod(guid: string): ModStatus {
  const current = store.jobs.get(guid);
  const fresh = current?.phase === "ready" && Date.now() - (current.finishedAt ?? 0) < READY_FOR_MS;
  if (current && (fresh || (current.phase !== "ready" && current.phase !== "failed"))) return status(current);
  const job: Job = {
    guid,
    name: null,
    version: null,
    phase: "checking",
    since: Date.now(),
    downloading: [],
    current: null,
    speed: null,
    addons: [],
    error: null,
    detail: null,
    finishedAt: null,
  };
  store.jobs.set(guid, job);
  void run(job).catch((e) => {
    console.error(`[mods] ${guid}:`, e);
    fail(job, "downloadFailed", e instanceof Error ? e.message : String(e));
  });
  return status(job);
}

function fail(job: Job, error: ModError, detail: string | null = null) {
  job.error = error;
  job.detail = detail;
  job.finishedAt = Date.now();
  setPhase(job, "failed");
}

async function run(job: Job) {
  const asset = await fetchWorkshopAsset(job.guid);
  if (asset === "notFound" || asset === "unreachable") return fail(job, asset);
  job.name = asset.name;
  job.version = asset.version;
  setPhase(job, "queued");
  await exclusive(async () => {
    // What the box lacks or has older than the Workshop's latest; nothing = served as it is, no download.
    const wanted = [{ id: asset.guid, version: asset.version }, ...asset.dependencies].filter((d) => d.id.toUpperCase() !== BASE_GAME);
    const stale: string[] = [];
    for (const d of wanted) {
      const have = await readAddon(d.id.toUpperCase());
      if (!have || (d.version && have.version !== d.version)) stale.push(d.id);
    }
    if (stale.length) {
      setPhase(job, "waiting");
      store.writer = true;
      try {
        while (store.readers > 0) await sleep(1000);
        setPhase(job, "downloading");
        console.log(`[mods] ${asset.name} (${job.guid}): downloading, stale: ${stale.join(", ")}`);
        const events: DownloadEvents = {
          started: (_, name) => {
            if (!job.downloading.includes(name)) job.downloading.push(name);
            job.current = { name, percent: 0, doneMb: 0, totalMb: 0 };
          },
          progress: (name, percent, doneMb, totalMb) => (job.current = { name, percent, doneMb, totalMb }),
          speed: (kb) => (job.speed = kb),
        };
        // Downloads resume fragment by fragment, so another run only fetches what's still missing.
        let result = await downloadAddons([job.guid], events);
        for (let attempt = 2; !result.ok && result.retry && attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
          console.log(`[mods] ${asset.name} (${job.guid}): ${result.detail} Running the server again (${attempt}/${DOWNLOAD_ATTEMPTS}).`);
          await sleep(5000);
          result = await downloadAddons([job.guid], events);
        }
        job.current = null;
        job.speed = null;
        if (!result.ok) return fail(job, "downloadFailed", result.detail);
      } finally {
        store.writer = false;
      }
    }
    setPhase(job, "preparing");
    const plan = await archivePlan(job.guid, new Set());
    if (!plan) return fail(job, "missing");
    job.addons = plan.addons;
    job.version = plan.addons[0].version ?? job.version;
    job.finishedAt = Date.now();
    setPhase(job, "ready");
  });
}

/* CRCs of the box's files, kept across restarts in crc.json and keyed by path, size and mtime: a patched file gets a new one. */
const CRC_FILE = path.join(MODS_DIR, "crc.json");

async function crcCache(): Promise<Map<string, number>> {
  if (store.crc) return store.crc;
  try {
    store.crc = new Map(Object.entries(JSON.parse(await readFile(CRC_FILE, "utf8")) as Record<string, number>));
  } catch {
    store.crc = new Map();
  }
  return store.crc;
}

async function fileCrc(abs: string, size: number, mtimeMs: number): Promise<number> {
  const cache = await crcCache();
  const key = `${path.relative(MODS_DIR, abs).split(path.sep).join("/")}|${size}|${Math.round(mtimeMs)}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  let pending = store.crcPending.get(key);
  if (!pending) {
    pending = (async () => {
      let crc = 0;
      for await (const chunk of createReadStream(abs, { highWaterMark: 4 * 1024 * 1024 })) crc = crc32(chunk as Buffer, crc);
      cache.set(key, crc);
      store.crcDirty = true;
      return crc;
    })().finally(() => store.crcPending.delete(key));
    store.crcPending.set(key, pending);
  }
  return pending;
}

async function saveCrcCache() {
  if (!store.crc || !store.crcDirty) return;
  store.crcDirty = false;
  await mkdir(MODS_DIR, { recursive: true });
  await writeFile(CRC_FILE, JSON.stringify(Object.fromEntries(store.crc)));
}

/**
 * The archive for `guid`, as the box has it now: the addon and its dependency tree, minus `skip` (dependencies the
 * member already has). Null when the box doesn't have the addon itself.
 */
export async function archivePlan(guid: string, skip: Set<string>): Promise<{ addons: ModAddon[]; entries: ZipEntry[] } | null> {
  const tree = await addonTree(guid);
  if (!tree[0]?.addon) return null;
  const addons: ModAddon[] = [];
  const entries: ZipEntry[] = [];
  for (const { guid: g, addon } of tree) {
    const requested = g === guid;
    if (!addon) {
      addons.push({ guid: g, name: g, version: null, size: 0, requested, missing: true });
      continue;
    }
    const files = await addonFiles(addon);
    addons.push({ guid: g, name: addon.name, version: addon.version, size: files.reduce((n, f) => n + f.size, 0), requested, missing: false });
    if (!requested && skip.has(g)) continue;
    for (const f of files) {
      const crc = await fileCrc(f.abs, f.size, f.mtimeMs);
      entries.push({ name: `${addon.folder}/${f.rel}`, path: f.abs, size: f.size, crc, mtime: new Date(f.mtimeMs) });
    }
  }
  await saveCrcCache();
  return { addons, entries };
}
