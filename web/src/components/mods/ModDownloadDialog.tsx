"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { format } from "@/lib/i18n";
import type { ModChoice, ModChoiceAddon, ModStatus } from "@/lib/mods/jobs";
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
  find: string;
  close: string;
  badLink: string;
  requestFailed: string;
  choiceHint: string;
  selectAll: string;
  selectNone: string;
  dependency: string;
  stateCurrent: string;
  stateStale: string;
  statePartial: string;
  stateMissing: string;
  fetch: string;
  fetchNone: string;
  prepare: string;
  queued: string;
  checking: string;
  waiting: string;
  downloading: string;
  preparing: string;
  cancel: string;
  leaveQueue: string;
  cancelled: string;
  leftQueue: string;
  notFound: string;
  unreachable: string;
  downloadFailed: string;
  missing: string;
  active: string;
  notOnServer: string;
  download: string;
  changeChoice: string;
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

const WORKSHOP = "https://reforger.armaplatform.com/workshop/";
/** Where the game keeps Workshop mods; Explorer's address bar takes it as it is. */
const ADDONS_FOLDER = "%USERPROFILE%\\Documents\\My Games\\ArmaReforger\\addons";
const POLL_MS = 1500;

/* The dialog closes and opens again from the pill: what it showed lives here. */
let lastLink = "";
let lastChoice: ModChoice | null = null;
let lastSkip: string[] = [];
let lastJob: ModStatus | null = null;

const active = (job: ModStatus | null) => !!job && job.phase !== "ready" && job.phase !== "failed" && job.phase !== "cancelled";

function size(bytes: number, l: ModDownloadLabels): string {
  const nf = new Intl.NumberFormat("ru", { maximumFractionDigits: 1 });
  if (bytes >= 1024 ** 3) return format(l.sizeGb, { n: nf.format(bytes / 1024 ** 3) });
  if (bytes >= 1024 ** 2) return format(l.sizeMb, { n: nf.format(bytes / 1024 ** 2) });
  return format(l.sizeKb, { n: nf.format(Math.max(1, Math.round(bytes / 1024))) });
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * «Скачать мод» (from the server pill): a Workshop link in, the mod and its dependencies listed with what the box
 * already has; the member unticks what they have, the box gets the rest (lib/mods/jobs.ts; a queue, which they can
 * leave, and a download they can cancel), and they download it as one zip for the game's addons folder.
 */
export function ModDownloadDialog({ labels: l, onClose }: { labels: ModDownloadLabels; onClose: () => void }) {
  const [link, setLinkState] = useState(lastLink);
  const [choice, setChoiceState] = useState<ModChoice | null>(lastChoice);
  const [skip, setSkipState] = useState<string[]>(lastSkip);
  const [job, setJobState] = useState<ModStatus | null>(lastJob);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const setLink = (v: string) => setLinkState((lastLink = v));
  const setChoice = (v: ModChoice | null) => setChoiceState((lastChoice = v));
  const setSkip = (v: string[]) => setSkipState((lastSkip = v));
  const setJob = (v: ModStatus | null) => setJobState((lastJob = v));

  // After a reload: the member's job, if the hub still has it.
  useEffect(() => {
    if (lastJob) return;
    let stopped = false;
    fetch("/api/mods/jobs", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ job: ModStatus | null }>) : null))
      .then(async (data) => {
        const restored = data?.job;
        if (stopped || !restored || lastJob) return;
        lastJob = restored;
        setJobState(restored);
        if (!lastLink) setLinkState((lastLink = `${WORKSHOP}${restored.guid}`));
        if (restored.phase !== "cancelled" && restored.phase !== "failed") return;
        // The list under a cancelled or failed job, with its ticks.
        const res = await fetch("/api/mods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: restored.guid }) });
        const fresh = res.ok ? ((await res.json()) as ModChoice) : null;
        if (stopped || !fresh || lastChoice) return;
        setSkipState((lastSkip = restored.skip));
        setChoiceState((lastChoice = fresh));
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, []);

  const choiceGuid = choice?.guid;
  useEffect(() => {
    if (!job || !active(job)) return;
    const timer = setTimeout(async () => {
      let next: ModStatus | null;
      try {
        const res = await fetch(`/api/mods/jobs/${job.id}`, { cache: "no-store" });
        // Not ok: the hub restarted and forgot the job, so it has to be started again.
        next = res.ok ? ((await res.json()) as ModStatus) : null;
        if (!next) setError(l.requestFailed);
      } catch {
        // Offline for a moment: the same job again, which polls again.
        next = { ...job };
      }
      lastJob = next;
      setJobState(next);
      // Cancelled or failed: back to the list, whose states (есть на сервере / скачает) the job may have changed.
      if ((next?.phase === "cancelled" || next?.phase === "failed") && choiceGuid === next.guid) {
        const res = await fetch("/api/mods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: next.guid }) }).catch(() => null);
        const fresh = res?.ok ? ((await res.json()) as ModChoice) : null;
        if (fresh?.guid === choiceGuid) setChoiceState((lastChoice = fresh));
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, choiceGuid, l.requestFailed]);

  const send = async <T,>(url: string, init: RequestInit): Promise<{ ok: boolean; data: T | null }> => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      return { ok: res.ok, data: (await res.json().catch(() => null)) as T | null };
    } catch {
      return { ok: false, data: null };
    } finally {
      setSending(false);
    }
  };

  /** Asks the hub for the mod's list; `keep`: the ticks to start from (else all ticked for a new mod). */
  const lookup = async (target: string, keep?: string[]) => {
    const { ok, data } = await send<ModChoice & { error?: string }>("/api/mods", { method: "POST", body: JSON.stringify({ link: target }) });
    if (ok && data) {
      if (keep) setSkip(keep);
      else if (data.guid !== choice?.guid) setSkip([]);
      setChoice(data);
      setJob(null);
      return;
    }
    // The error is about the new link: the previous mod goes.
    setChoice(null);
    setJob(null);
    const code = data?.error;
    setError(code === "badLink" ? l.badLink : code === "notFound" ? l.notFound : code === "unreachable" ? l.unreachable : l.requestFailed);
  };

  const find = (e: FormEvent) => {
    e.preventDefault();
    if (link.trim() && !sending && !active(job)) void lookup(link);
  };

  /** Back to the list with the job's ticks, asked for again: the job changed what the box has. */
  const changeChoice = () => {
    if (job) void lookup(job.guid, job.skip);
  };

  const prepare = async () => {
    if (!choice || sending) return;
    const { data } = await send<{ job?: ModStatus; error?: string }>("/api/mods/jobs", { method: "POST", body: JSON.stringify({ guid: choice.guid, skip }) });
    if (data?.job) setJob(data.job);
    setError(data?.error === "active" ? l.active : data?.job ? null : l.requestFailed);
  };

  const cancel = async () => {
    if (!job || sending) return;
    const { data } = await send<ModStatus>(`/api/mods/jobs/${job.id}`, { method: "DELETE" });
    if (data?.id) setJob(data);
  };

  const ticked = (a: ModChoiceAddon) => a.requested || !skip.includes(a.guid);
  const chosen = choice?.addons.filter(ticked) ?? [];
  const deps = choice?.addons.filter((a) => !a.requested) ?? [];
  const ready = job?.phase === "ready" ? job : null;
  const zipSize = ready ? ready.addons.filter((a) => !a.missing).reduce((n, a) => n + a.size, 0) : 0;
  const zipHref = ready ? `/api/mods/${ready.guid}/zip${ready.include.length > 1 ? `?deps=${ready.include.slice(1).join(",")}` : ""}` : "";
  const state = { current: l.stateCurrent, stale: l.stateStale, partial: l.statePartial, missing: l.stateMissing };

  let footer = (
    <button type="button" onClick={onClose} className={buttonClass("secondary", "m")}>
      {l.close}
    </button>
  );
  if (job && active(job)) {
    footer = (
      <>
        <button type="button" onClick={cancel} disabled={sending} className={buttonClass("secondary", "m")}>
          {job.phase === "queued" ? l.leaveQueue : l.cancel}
        </button>
        {footer}
      </>
    );
  } else if (ready) {
    footer = (
      <>
        {footer}
        <button type="button" onClick={changeChoice} disabled={sending} className={buttonClass("secondary", "m")}>
          {l.changeChoice}
        </button>
        <a
          href={ready.busy ? undefined : zipHref}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!!ready.busy}
          className={`${buttonClass("primary", "m")} ${ready.busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {format(l.download, { size: size(zipSize, l) })}
        </a>
      </>
    );
  } else if (choice) {
    footer = (
      <>
        {footer}
        <button type="button" onClick={prepare} disabled={sending} className={buttonClass("primary", "m")}>
          {format(l.prepare, { size: size(chosen.reduce((n, a) => n + a.size, 0), l) })}
        </button>
      </>
    );
  }

  return (
    <DialogShell title={l.title} width="max-w-lg" onClose={onClose} footer={<div className="flex flex-wrap justify-end gap-2">{footer}</div>}>
      <div className="flex flex-col gap-5">
        <p className="type-body-s text-fg-secondary">{l.intro}</p>
        <form onSubmit={find} className="flex flex-col gap-2">
          <Field label={l.link}>
            <div className="flex gap-2">
              <TextInput
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={l.linkPlaceholder}
                autoFocus
                spellCheck={false}
                disabled={active(job)}
                className="min-w-0 flex-1"
              />
              <button type="submit" disabled={sending || !link.trim() || active(job)} className={buttonClass("secondary", "m")}>
                {l.find}
              </button>
            </div>
          </Field>
          {error && <p className="type-body-s text-fg-danger">{error}</p>}
        </form>

        {job && active(job) ? (
          <Progress job={job} name={job.name ?? (choice?.guid === job.guid ? choice.name : null)} l={l} />
        ) : ready ? (
          <div className="flex flex-col gap-4">
            <AddonList>
              {ready.addons.map((a) => (
                <AddonRow
                  key={a.guid}
                  name={a.name}
                  muted={a.missing}
                  caption={[a.version && `v${a.version}`, !a.requested && l.dependency, a.missing && l.notOnServer]}
                  size={a.missing ? null : size(a.size, l)}
                />
              ))}
            </AddonList>
            <div className="flex flex-col gap-1.5">
              <p className="type-body-s text-fg-secondary">{l.unpack}</p>
              <div className="flex min-w-0 rounded-lg bg-inset px-3 py-2 type-label-s">
                <CopyValue value={ADDONS_FOLDER} hint={l.copyHint} copiedLabel={l.copied} />
              </div>
              <p className="type-caption text-fg-tertiary">{l.unpackHint}</p>
            </div>
            {ready.busy && <p className="type-body-s text-fg-secondary">{ready.busy === "updating" ? l.busyUpdating : l.busyFull}</p>}
          </div>
        ) : (
          <>
            {(job?.phase === "failed" || job?.phase === "cancelled") && (
              <div className="flex flex-col gap-1 rounded-lg bg-inset p-3">
                {job.phase === "cancelled" ? (
                  // Nothing started downloading: they only left the queue.
                  <p className="type-body-s text-fg-secondary">{job.name ? l.cancelled : l.leftQueue}</p>
                ) : (
                  <p className="type-body-s text-fg-danger">{job.error ? l[job.error] : l.requestFailed}</p>
                )}
                {job.detail && job.phase === "failed" && <p className="type-caption break-words text-fg-tertiary">{job.detail}</p>}
              </div>
            )}
            {choice && (
              <div className="flex flex-col gap-3">
                {deps.length > 0 && (
                  <div className="flex items-baseline gap-3">
                    <p className="flex-1 type-caption text-fg-tertiary">{l.choiceHint}</p>
                    <button type="button" onClick={() => setSkip([])} className="shrink-0 type-caption-strong text-fg-accent hover:underline">
                      {l.selectAll}
                    </button>
                    <button type="button" onClick={() => setSkip(deps.map((a) => a.guid))} className="shrink-0 type-caption-strong text-fg-accent hover:underline">
                      {l.selectNone}
                    </button>
                  </div>
                )}
                <AddonList>
                  {choice.addons.map((a) => (
                    <AddonRow
                      key={a.guid}
                      name={a.name}
                      muted={!ticked(a)}
                      caption={[a.version && `v${a.version}`, !a.requested && l.dependency, ticked(a) && state[a.state]]}
                      size={size(a.size, l)}
                      check={{
                        checked: ticked(a),
                        disabled: a.requested,
                        onChange: (on) => setSkip(on ? skip.filter((g) => g !== a.guid) : [...skip, a.guid]),
                      }}
                    />
                  ))}
                </AddonList>
                <FetchLine addons={chosen} l={l} />
              </div>
            )}
          </>
        )}
      </div>
    </DialogShell>
  );
}

function AddonList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">{children}</ul>;
}

/** One addon: name, a caption of version · dependency · where the box stands, size; a checkbox while choosing. */
function AddonRow({
  name,
  caption,
  size,
  muted,
  check,
}: {
  name: string;
  caption: (string | null | false)[];
  size: string | null;
  muted: boolean;
  check?: { checked: boolean; disabled: boolean; onChange: (on: boolean) => void };
}) {
  const body = (
    <>
      {check && (
        <input
          type="checkbox"
          checked={check.checked}
          disabled={check.disabled}
          onChange={(e) => check.onChange(e.target.checked)}
          className="size-4 shrink-0 cursor-pointer accent-[var(--ts-color-bg-accent)] disabled:cursor-default"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate type-label-s ${muted ? "text-fg-tertiary" : "text-fg"}`}>{name}</span>
        <span className="type-caption text-fg-tertiary">{caption.filter(Boolean).join(" · ")}</span>
      </span>
      {size && <span className="shrink-0 type-caption text-fg-secondary tabular-nums">{size}</span>}
    </>
  );
  return (
    <li>
      {check ? (
        <label className={`flex items-center gap-3 px-3 py-2.5 ${check.disabled ? "" : "cursor-pointer"}`}>{body}</label>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5">{body}</div>
      )}
    </li>
  );
}

/** What the box would download from the Workshop for the ticked addons. */
function FetchLine({ addons, l }: { addons: ModChoiceAddon[]; l: ModDownloadLabels }) {
  const fetchBytes = addons.filter((a) => a.state !== "current").reduce((n, a) => n + a.size, 0);
  return <p className="type-caption text-fg-tertiary">{fetchBytes > 0 ? format(l.fetch, { size: size(fetchBytes, l) }) : l.fetchNone}</p>;
}

/** What the box is doing about the mod, with the time it's been at it. */
function Progress({ job, name, l }: { job: ModStatus; name: string | null; l: ModDownloadLabels }) {
  const text =
    job.phase === "queued"
      ? format(l.queued, { n: job.ahead })
      : { checking: l.checking, waiting: l.waiting, downloading: l.downloading, preparing: l.preparing }[job.phase as "checking" | "waiting" | "downloading" | "preparing"];
  const current = job.phase === "downloading" ? job.current : null;
  const done = job.phase === "downloading" ? job.downloading.slice(0, -1) : [];
  const nf = new Intl.NumberFormat("ru", { maximumFractionDigits: 1 });
  const speed =
    job.speed == null ? null : job.speed >= 1024 ? format(l.speedMb, { n: nf.format(job.speed / 1024) }) : format(l.speedKb, { n: Math.round(job.speed) });
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-inset p-3">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {name && <p className="truncate type-label-s text-fg">{name}</p>}
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
