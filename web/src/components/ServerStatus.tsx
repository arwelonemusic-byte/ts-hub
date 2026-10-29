"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { ServerInfo } from "@/lib/server-status";
import { CopyValue } from "./event/CopyValue";
import { ModDownloadDialog, type ModDownloadLabels } from "./mods/ModDownloadDialog";
import { buttonClass, Icon } from "./ui";

export interface ServerStatusLabels {
  up: string;
  down: string;
  name: string;
  password: string;
  ip: string;
  port: string;
  collapse: string;
  copyHint: string;
  copied: string;
}

const EVERY_MS = 30_000;

/*
 * AppHeader renders on every page, so this remounts on each navigation: the last answer and whether the card
 * was open live here, outside React, so moving between pages neither blinks the pill nor folds the card.
 */
let lastUp: boolean | null = null;
let lastOpen = false;

/**
 * The game server's status in the bottom-right corner: a pill (grey or green dot, «Сервер запущен / отдыхает»)
 * that opens into a card with how to join, and «Скачать мод» when the box can download mods (`mods`).
 * Asks /api/server-status every 30 s while the tab is visible.
 */
export function ServerStatus({ info, labels, mods }: { info: ServerInfo; labels: ServerStatusLabels; mods?: ModDownloadLabels }) {
  const [up, setUp] = useState<boolean | null>(lastUp);
  const [open, setOpenState] = useState(lastOpen);
  const [modDialog, setModDialog] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const setOpen = (o: boolean) => {
    lastOpen = o;
    setOpenState(o);
  };

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      clearTimeout(timer);
      // A hidden tab stops checking; coming back checks at once (below).
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/server-status", { cache: "no-store" });
        if (res.ok) {
          const { up: now } = (await res.json()) as { up: boolean };
          lastUp = now;
          if (!stopped) setUp(now);
        }
      } catch {
        // Offline or a deploy restarting the hub: keep the last answer, try again next round.
      }
      if (!stopped) timer = setTimeout(check, EVERY_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing until the first answer, so a stopped server never flashes «запущен».
  if (up === null) return null;
  const status = up ? labels.up : labels.down;
  const rows = [
    [labels.name, info.name],
    [labels.password, info.password],
    [labels.ip, info.ip],
    [labels.port, String(info.port)],
  ].filter((r): r is [string, string] => !!r[1]);

  return (
    <div ref={root} className="fixed right-4 bottom-4 z-40 md:right-6 md:bottom-6">
      {open ? (
        <section
          aria-label={status}
          className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 rounded-xl bg-surface p-4 shadow-floating ring-1 ring-line-strong"
        >
          <div className="flex items-center gap-2.5">
            <Dot up={up} />
            <h2 className="flex-1 type-label-m text-fg">{status}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={labels.collapse}
              className="-my-1 -mr-1.5 flex size-8 items-center justify-center rounded-md hover:bg-raised"
            >
              <Icon name="close" />
            </button>
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-line pt-3 type-body-s">
            {rows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-fg-tertiary">{label}</dt>
                <dd className="flex min-w-0 type-label-s">
                  <CopyValue value={value} hint={labels.copyHint} copiedLabel={labels.copied} />
                </dd>
              </Fragment>
            ))}
          </dl>
          {mods && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setModDialog(true);
              }}
              className={`${buttonClass("secondary", "s")} w-full`}
            >
              {mods.open}
            </button>
          )}
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="flex h-9 items-center gap-2 rounded-full bg-surface pr-3.5 pl-3 shadow-floating ring-1 ring-line-strong type-label-s text-fg hover:bg-raised"
        >
          <Dot up={up} />
          {status}
        </button>
      )}
      {modDialog && mods && <ModDownloadDialog labels={mods} onClose={() => setModDialog(false)} />}
    </div>
  );
}

/** Green with a slow ping while the server is up, grey while it rests. */
function Dot({ up }: { up: boolean }) {
  return (
    <span aria-hidden className="relative flex size-2 shrink-0">
      {up && <span className="absolute inset-0 rounded-full bg-success opacity-60 motion-safe:animate-ping" />}
      <span className={`relative size-2 rounded-full ${up ? "bg-success" : "bg-fg-disabled"}`} />
    </span>
  );
}
