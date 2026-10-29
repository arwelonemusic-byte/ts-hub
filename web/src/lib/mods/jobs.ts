import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";
import { fetchWorkshopAsset } from "../missions/workshop";
import { downloadAddons, pause, type DownloadEvents, type Placeholder } from "./download";
import { addonFiles, addonState, MODS_DIR, readAddon, type AddonState } from "./mirror";
import type { ZipEntry } from "./zip";

/*
 * «Скачать мод» (the server pill): a member pastes a Workshop link and sees the mod and its dependencies with what
 * the box already has (`lookupMod`); they untick the dependencies they have, and a job gets the rest onto the box at
 * the Workshop's latest versions (the dedicated server downloads only those: unticked ones become placeholders, see
 * download.ts) and then the member downloads them as one zip for the game's addons folder. Mods the box already has
 * at the latest version cost no download. A POC: jobs live in memory, and the box's copy only grows.
 *
 * Jobs run one at a time, in a queue. A member has one job at a time and can leave the queue or cancel a running
 * job: the server is killed, and what it got so far stays for the next run to resume. Downloads and archives share
 * the folder: the server patches files in place, so it waits until no zip is being sent, and no zip starts while it runs.
 */

export type ModPhase = "queued" | "checking" | "waiting" | "downloading" | "preparing" | "ready" | "failed" | "cancelled";
export type ModError = "notFound" | "unreachable" | "downloadFailed" | "missing";

/** One row of the choice: the mod or one of its dependencies, at the Workshop's latest version. */
export interface ModChoiceAddon {
  guid: string;
  name: string;
  version: string | null;
  /** Bytes, from the Workshop. */
  size: number;
  requested: boolean;
  state: AddonState;
}

export interface ModChoice {
  guid: string;
  name: string;
  version: string | null;
  /** The mod first, then every dependency (nested ones too). */
  addons: ModChoiceAddon[];
}

/** An addon in a ready job's zip. */
export interface ModAddon {
  guid: string;
  name: string;
  version: string | null;
  /** Bytes in the archive. */
  size: number;
  requested: boolean;
  /** Ticked, but the box couldn't get it: it isn't in the archive. */
  missing: boolean;
}

/** What the dialog shows; also the job's state. */
export interface ModStatus {
  id: string;
  guid: string;
  name: string | null;
  version: string | null;
  /** Dependencies left out (unticked). */
  skip: string[];
  /** When ready: the zip's addons, the mod first (`?deps=` on the zip link is the rest). */
  include: string[];
  phase: ModPhase;
  /** Jobs before this one while it's queued (the running one included). */
  ahead: number;
  /** Seconds in the current phase. */
  elapsed: number;
  /** While downloading: the addons the server has started on, in order. */
  downloading: string[];
  /** The addon being downloaded, as the server's log last put it (every ~10 s). */
  current: { name: string; percent: number; doneMb: number; totalMb: number } | null;
  /** KB/s, from the same log. */
  speed: number | null;
  /** When ready: what's in the zip. */
  addons: ModAddon[];
  error: ModError | null;
  /** The server's log line when a download failed. */
  detail: string | null;
  /** Why a zip can't start right now: the server is downloading, or enough zips are being sent. */
  busy: "updating" | "full" | null;
}

interface Job extends Omit<ModStatus, "ahead" | "elapsed" | "busy"> {
  /** The member's Discord id. */
  owner: string;
  since: number;
  finishedAt: number | null;
  abort: AbortController;
}

/** A finished job is kept this long (the dialog shows it after a reload), then forgotten. */
const KEEP_MS = 30 * 60_000;
/** Zips sent at once, each at most HUB_MODS_RATE_MBIT (the game server shares the box's 1 Gbit/s). */
const MAX_STREAMS = 3;
export const STREAM_BYTES_PER_SEC = (Number(process.env.HUB_MODS_RATE_MBIT) || 200) * 125_000;
/** Server runs per job when Bohemia's API doesn't answer. */
const DOWNLOAD_ATTEMPTS = 3;
const BASE_GAME = "58D0FB3206B6F859";
const ACTIVE: ModPhase[] = ["queued", "checking", "waiting", "downloading", "preparing"];

type Store = {
  jobs: Map<string, Job>;
  queue: Job[];
  running: Job | null;
  readers: number;
  writer: boolean;
  crc: Map<string, number> | null;
  crcPending: Map<string, Promise<number>>;
  /** New CRCs not yet in crc.json. */
  crcDirty: boolean;
};
const g = globalThis as unknown as { __tsHubModJobs?: Store };
const store: Store = (g.__tsHubModJobs ??= {
  jobs: new Map(),
  queue: [],
  running: null,
  readers: 0,
  writer: false,
  crc: null,
  crcPending: new Map(),
  crcDirty: false,
});

/** Starts a zip; false with the reason when it can't start now. `releaseArchive` must run when it ends. */
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
  const queued = store.queue.indexOf(job);
  return {
    id: job.id,
    guid: job.guid,
    name: job.name,
    version: job.version,
    skip: job.skip,
    include: job.include,
    phase: job.phase,
    ahead: queued < 0 ? 0 : queued + (store.running ? 1 : 0),
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
  if (!ACTIVE.includes(phase)) job.finishedAt = Date.now();
}

function fail(job: Job, error: ModError, detail: string | null = null) {
  job.error = error;
  job.detail = detail;
  setPhase(job, "failed");
}

function prune() {
  for (const [id, job] of store.jobs) if (job.finishedAt && Date.now() - job.finishedAt > KEEP_MS) store.jobs.delete(id);
}

/** The mod behind a Workshop link and every dependency, with where the box stands with each. */
export async function lookupMod(guid: string): Promise<ModChoice | "notFound" | "unreachable"> {
  const asset = await fetchWorkshopAsset(guid);
  if (asset === "notFound" || asset === "unreachable") return asset;
  const rows = [{ id: asset.guid, name: asset.name, version: asset.version, size: asset.size }, ...asset.dependencies];
  const addons: ModChoiceAddon[] = [];
  for (const d of rows) {
    const id = d.id.toUpperCase();
    if (id === BASE_GAME || addons.some((a) => a.guid === id)) continue;
    const state = addonState(await readAddon(id), d.version);
    addons.push({ guid: id, name: d.name, version: d.version, size: d.size ?? 0, requested: id === asset.guid, state });
  }
  return { guid: asset.guid, name: asset.name, version: asset.version, addons };
}

/** The member's job: the active one, else the last one still kept. */
export function memberJob(owner: string): ModStatus | null {
  prune();
  const mine = [...store.jobs.values()].filter((j) => j.owner === owner);
  const job = mine.find((j) => ACTIVE.includes(j.phase)) ?? mine.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0];
  return job ? status(job) : null;
}

export function jobStatus(id: string, owner: string): ModStatus | null {
  const job = store.jobs.get(id);
  return job && job.owner === owner ? status(job) : null;
}

/** Queues getting `guid` without the `skip` dependencies; refused while the member has another job going. */
export function startJob(owner: string, guid: string, skip: string[]): { job: ModStatus } | { error: "active"; job: ModStatus } {
  prune();
  const active = [...store.jobs.values()].find((j) => j.owner === owner && ACTIVE.includes(j.phase));
  if (active) return { error: "active", job: status(active) };
  const job: Job = {
    id: randomUUID(),
    owner,
    guid,
    name: null,
    version: null,
    skip: [...new Set(skip.filter((s) => s !== guid))],
    include: [],
    phase: "queued",
    since: Date.now(),
    finishedAt: null,
    downloading: [],
    current: null,
    speed: null,
    addons: [],
    error: null,
    detail: null,
    abort: new AbortController(),
  };
  store.jobs.set(job.id, job);
  store.queue.push(job);
  pump();
  return { job: status(job) };
}

/** Leaves the queue or stops the running job (its server is killed). Owner or an admin. */
export function cancelJob(id: string, owner: string, admin: boolean): ModStatus | null {
  const job = store.jobs.get(id);
  if (!job || (job.owner !== owner && !admin)) return null;
  if (!ACTIVE.includes(job.phase)) return status(job);
  const queued = store.queue.indexOf(job);
  if (queued >= 0) {
    store.queue.splice(queued, 1);
    setPhase(job, "cancelled");
  } else {
    // work() sees it and ends the job as cancelled once the server is down.
    job.abort.abort();
  }
  return status(job);
}

function pump() {
  if (store.running) return;
  const job = store.queue.shift();
  if (!job) return;
  store.running = job;
  void work(job)
    .catch((e) => {
      console.error(`[mods] ${job.guid}:`, e);
      fail(job, "downloadFailed", e instanceof Error ? e.message : String(e));
    })
    .finally(() => {
      store.running = null;
      pump();
    });
}

async function work(job: Job) {
  const signal = job.abort.signal;
  const cancelled = () => {
    if (signal.aborted) setPhase(job, "cancelled");
    return signal.aborted;
  };
  setPhase(job, "checking");
  const asset = await fetchWorkshopAsset(job.guid);
  if (cancelled()) return;
  if (asset === "notFound" || asset === "unreachable") return fail(job, asset);
  job.name = asset.name;
  job.version = asset.version;

  // Ticked = the mod and every dependency not in `skip`; the box gets those it doesn't have at the latest version.
  const skip = new Set(job.skip);
  const tree = [{ id: asset.guid, name: asset.name, version: asset.version }, ...asset.dependencies]
    .map((d) => ({ ...d, id: d.id.toUpperCase() }))
    .filter((d) => d.id !== BASE_GAME);
  const ticked = tree.filter((d) => !skip.has(d.id));
  const placeholders: Placeholder[] = tree.filter((d) => skip.has(d.id) && d.version).map((d) => ({ guid: d.id, name: d.name, version: d.version! }));
  const stale: string[] = [];
  for (const d of ticked) if (addonState(await readAddon(d.id), d.version) !== "current") stale.push(d.id);

  if (stale.length) {
    setPhase(job, "waiting");
    store.writer = true;
    try {
      while (store.readers > 0 && !signal.aborted) await pause(1000, signal);
      if (cancelled()) return;
      setPhase(job, "downloading");
      console.log(`[mods] ${asset.name} (${job.guid}): downloading ${stale.join(", ")}${placeholders.length ? `, skipping ${placeholders.length}` : ""}`);
      const events: DownloadEvents = {
        started: (_, name) => {
          if (!job.downloading.includes(name)) job.downloading.push(name);
          job.current = { name, percent: 0, doneMb: 0, totalMb: 0 };
        },
        progress: (name, percent, doneMb, totalMb) => (job.current = { name, percent, doneMb, totalMb }),
        speed: (kb) => (job.speed = kb),
      };
      // Every ticked addon is in the server's config: one under an unticked dependency isn't reached through it.
      const guids = ticked.map((d) => d.id);
      let result = await downloadAddons(guids, placeholders, events, signal);
      // Downloads resume fragment by fragment, so another run only fetches what's still missing.
      for (let attempt = 2; !result.ok && result.retry && !signal.aborted && attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
        console.log(`[mods] ${asset.name} (${job.guid}): ${result.detail} Running the server again (${attempt}/${DOWNLOAD_ATTEMPTS}).`);
        await pause(5000, signal);
        if (!signal.aborted) result = await downloadAddons(guids, placeholders, events, signal);
      }
      job.current = null;
      job.speed = null;
      if (cancelled()) return;
      if (!result.ok) return fail(job, "downloadFailed", result.detail);
    } finally {
      store.writer = false;
    }
  }

  setPhase(job, "preparing");
  job.include = ticked.map((d) => d.id);
  const plan = await archivePlan(job.include);
  if (cancelled()) return;
  if (!plan) return fail(job, "missing");
  job.addons = plan.addons;
  job.version = plan.addons[0].version ?? job.version;
  setPhase(job, "ready");
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
 * The zip of `ids` (the mod first, then the ticked dependencies) as the box has them now; an addon not completely
 * downloaded is listed as missing and left out. Null when the box doesn't have the mod itself.
 */
export async function archivePlan(ids: string[]): Promise<{ addons: ModAddon[]; entries: ZipEntry[] } | null> {
  const addons: ModAddon[] = [];
  const entries: ZipEntry[] = [];
  for (const [i, g] of [...new Set(ids)].entries()) {
    const addon = await readAddon(g);
    if (!addon?.complete) {
      if (i === 0) return null;
      addons.push({ guid: g, name: addon?.name ?? g, version: addon?.version ?? null, size: 0, requested: false, missing: true });
      continue;
    }
    const files = await addonFiles(addon);
    addons.push({ guid: g, name: addon.name, version: addon.version, size: files.reduce((n, f) => n + f.size, 0), requested: i === 0, missing: false });
    for (const f of files) {
      const crc = await fileCrc(f.abs, f.size, f.mtimeMs);
      entries.push({ name: `${addon.folder}/${f.rel}`, path: f.abs, size: f.size, crc, mtime: new Date(f.mtimeMs) });
    }
  }
  await saveCrcCache();
  return { addons, entries };
}
