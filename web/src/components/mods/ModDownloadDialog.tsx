"use client";

import { useEffect, useState, type FormEvent } from "react";
import { format } from "@/lib/i18n";
import type { ModAddon, ModStatus } from "@/lib/mods/jobs";
import { CopyValue } from "../event/CopyValue";
import { DialogShell } from "../mission/editor/DialogShell";
import { Field, TextInput } from "../mission/editor/fields";
import { buttonClass } from "../ui";

export interface ModDownloadLabels {
  open: string;
  title: string;
  intro: string;
  link: string;
  linkPlaceholder: string;
  prepare: string;
  close: string;
  badLink: string;
  requestFailed: string;
  checking: string;
  queued: string;
  waiting: string;
  downloading: string;
  preparing: string;
  notFound: string;
  unreachable: string;
  downloadFailed: string;
  missing: string;
  dependency: string;
  notOnServer: string;
  skipHint: string;
  download: string;
  unpack: string;
  unpackHint: string;
  busyUpdating: string;
  busyFull: string;
  sizeKb: string;
  sizeMb: string;
  sizeGb: string;
  progressMb: string;
  speedKb: string;
  speedMb: string;
  doneList: string;
  copyHint: string;
  copied: string;
}

/** Where the game keeps Workshop mods; Explorer's address bar takes it as it is. */
const ADDONS_FOLDER = "%USERPROFILE%\\Documents\\My Games\\ArmaReforger\\addons";
const POLL_MS = 1500;

/* The dialog closes and opens again from the pill: the link, the job and the unticked dependencies live here. */
let lastLink = "";
let lastJob: ModStatus | null = null;
let lastSkip: string[] = [];

const active = (job: ModStatus | null) => !!job && job.phase !== "ready" && job.phase !== "failed";

function size(bytes: number, l: ModDownloadLabels): string {
  const nf = new Intl.NumberFormat("ru", { maximumFractionDigits: 1 });
  if (bytes >= 1024 ** 3) return format(l.sizeGb, { n: nf.format(bytes / 1024 ** 3) });
  if (bytes >= 1024 ** 2) return format(l.sizeMb, { n: nf.format(bytes / 1024 ** 2) });
  return format(l.sizeKb, { n: nf.format(Math.max(1, Math.round(bytes / 1024))) });
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * «Скачать мод» (from the server pill): a Workshop link in, the box gets the mod and its dependencies ready
 * (lib/mods/jobs.ts), and the member downloads them as one zip for the game's addons folder.
 */
export function ModDownloadDialog({ labels: l, onClose }: { labels: ModDownloadLabels; onClose: () => void }) {
  const [link, setLinkState] = useState(lastLink);
  const [job, setJobState] = useState<ModStatus | null>(lastJob);
  const [skip, setSkipState] = useState<string[]>(lastSkip);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const setLink = (v: string) => setLinkState((lastLink = v));
  const setJob = (v: ModStatus | null) => setJobState((lastJob = v));
  const setSkip = (v: string[]) => setSkipState((lastSkip = v));

  useEffect(() => {
    if (!job || !active(job)) return;
    const timer = setTimeout(async () => {
      let next: ModStatus | null;
      try {
        const res = await fetch(`/api/mods/${job.guid}`, { cache: "no-store" });
        // Not ok: the hub restarted and forgot the job, so it has to be asked for again.
        next = res.ok ? ((await res.json()) as ModStatus) : null;
        if (!next) setError(l.requestFailed);
      } catch {
        // Offline for a moment: the same job again, which polls again.
        next = { ...job };
      }
      lastJob = next;
      setJobState(next);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, l.requestFailed]);

  const prepare = async (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/mods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) });
      const data = (await res.json().catch(() => null)) as unknown;
      if (res.ok && data) {
        const next = data as ModStatus;
        if (next.guid !== job?.guid) setSkip([]);
        setJob(next);
      } else {
        // The error is about the new link: the previous mod's list goes.
        setJob(null);
        setError((data as { error?: unknown } | null)?.error === "badLink" ? l.badLink : l.requestFailed);
      }
    } catch {
      setError(l.requestFailed);
    } finally {
      setSending(false);
    }
  };

  const ready = job?.phase === "ready";
  const included = (a: ModAddon) => !a.missing && (a.requested || !skip.includes(a.guid));
  const total = ready ? job.addons.filter(included).reduce((n, a) => n + a.size, 0) : 0;
  const zipHref = job ? `/api/mods/${job.guid}/zip${skip.length ? `?skip=${skip.join(",")}` : ""}` : "";

  return (
    <DialogShell
      title={l.title}
      width="max-w-lg"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("secondary", "m")}>
            {l.close}
          </button>
          {ready && (
            <a
              href={job.busy ? undefined : zipHref}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!!job.busy}
              className={`${buttonClass("primary", "m")} ${job.busy ? "pointer-events-none opacity-60" : ""}`}
            >
              {format(l.download, { size: size(total, l) })}
            </a>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="type-body-s text-fg-secondary">{l.intro}</p>
        <form onSubmit={prepare} className="flex flex-col gap-2">
          <Field label={l.link}>
            <div className="flex gap-2">
              <TextInput
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={l.linkPlaceholder}
                autoFocus
                spellCheck={false}
                className="min-w-0 flex-1"
              />
              <button type="submit" disabled={sending || !link.trim() || active(job)} className={buttonClass("secondary", "m")}>
                {l.prepare}
              </button>
            </div>
          </Field>
          {error && <p className="type-body-s text-fg-danger">{error}</p>}
        </form>

        {job && active(job) && <Progress job={job} l={l} />}

        {job?.phase === "failed" && (
          <div className="flex flex-col gap-1 rounded-lg bg-inset p-3">
            <p className="type-body-s text-fg-danger">{job.error ? l[job.error] : l.requestFailed}</p>
            {job.detail && <p className="type-caption break-words text-fg-tertiary">{job.detail}</p>}
          </div>
        )}

        {ready && (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {job.addons.map((a) => (
                <li key={a.guid}>
                  <label className={`flex items-center gap-3 px-3 py-2.5 ${a.requested || a.missing ? "" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={included(a)}
                      disabled={a.requested || a.missing}
                      onChange={(e) => setSkip(e.target.checked ? skip.filter((g) => g !== a.guid) : [...skip, a.guid])}
                      className="size-4 shrink-0 cursor-pointer accent-[var(--ts-color-bg-accent)] disabled:cursor-default"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`truncate type-label-s ${included(a) ? "text-fg" : "text-fg-tertiary"}`}>{a.name}</span>
                      <span className="type-caption text-fg-tertiary">
                        {[a.version && `v${a.version}`, !a.requested && l.dependency, a.missing && l.notOnServer].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {!a.missing && <span className="shrink-0 type-caption text-fg-secondary tabular-nums">{size(a.size, l)}</span>}
                  </label>
                </li>
              ))}
            </ul>
            {job.addons.length > 1 && <p className="type-caption text-fg-tertiary">{l.skipHint}</p>}
            <div className="flex flex-col gap-1.5">
              <p className="type-body-s text-fg-secondary">{l.unpack}</p>
              <div className="flex min-w-0 rounded-lg bg-inset px-3 py-2 type-label-s">
                <CopyValue value={ADDONS_FOLDER} hint={l.copyHint} copiedLabel={l.copied} />
              </div>
              <p className="type-caption text-fg-tertiary">{l.unpackHint}</p>
            </div>
            {job.busy && <p className="type-body-s text-fg-secondary">{job.busy === "updating" ? l.busyUpdating : l.busyFull}</p>}
          </div>
        )}
      </div>
    </DialogShell>
  );
}

/** What the box is doing about the mod, with the time it's been at it. */
function Progress({ job, l }: { job: ModStatus; l: ModDownloadLabels }) {
  const text = { checking: l.checking, queued: l.queued, waiting: l.waiting, downloading: l.downloading, preparing: l.preparing }[
    job.phase as "checking" | "queued" | "waiting" | "downloading" | "preparing"
  ];
  const current = job.phase === "downloading" ? job.current : null;
  const done = job.phase === "downloading" ? job.downloading.slice(0, -1) : [];
  const nf = new Intl.NumberFormat("ru", { maximumFractionDigits: 1 });
  const speed =
    job.speed == null ? null : job.speed >= 1024 ? format(l.speedMb, { n: nf.format(job.speed / 1024) }) : format(l.speedKb, { n: Math.round(job.speed) });
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-inset p-3">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {job.name && <p className="truncate type-label-s text-fg">{job.name}</p>}
        <p className="type-body-s text-fg-secondary">{text}</p>
        {current && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <div className="flex items-baseline gap-3 type-caption">
              <span className="min-w-0 flex-1 truncate text-fg-secondary">{current.name}</span>
              <span className="shrink-0 text-fg-tertiary tabular-nums">
                {[`${current.percent}%`, current.totalMb > 0 && format(l.progressMb, { done: current.doneMb, total: current.totalMb }), speed]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${current.percent}%` }} />
            </div>
          </div>
        )}
        {done.length > 0 && <p className="mt-1 type-caption break-words text-fg-tertiary">{format(l.doneList, { names: done.join(", ") })}</p>}
      </div>
      <span className="type-caption text-fg-tertiary tabular-nums">{clock(job.elapsed)}</span>
    </div>
  );
}
