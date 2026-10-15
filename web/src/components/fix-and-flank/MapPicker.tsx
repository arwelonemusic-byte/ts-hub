"use client";

import { useMemo, useState } from "react";
import { DialogShell } from "@/components/mission/editor/DialogShell";
import { Select, TextInput } from "@/components/mission/editor/fields";
import { buttonClass, Eyebrow, Icon } from "@/components/ui";
import { playUrl } from "@/lib/fix-and-flank/game";
import { MapThumb } from "./MapCard";
import type { FnfMap, FnfSort } from "@/lib/fix-and-flank/types";
import { makeT, plural, type Locale } from "@/lib/i18n";

/**
 * «Играть» on the game page (sketch 3): a dialog to pick the map first, with a search by name, an author
 * filter and a sort (newest, or most played). Picking a map starts the game on it.
 */
export function PlayPicker({ maps, locale, className }: { maps: { fresh: FnfMap[]; popular: FnfMap[] }; locale: Locale; className?: string }) {
  const t = useMemo(() => makeT(locale), [locale]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? buttonClass("primary", "m")}>
        <Icon name="play" />
        {t("fnf.play")}
      </button>
      {open && <PickerDialog maps={maps} locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}

function PickerDialog({ maps, locale, onClose }: { maps: { fresh: FnfMap[]; popular: FnfMap[] }; locale: Locale; onClose: () => void }) {
  const t = useMemo(() => makeT(locale), [locale]);
  const [q, setQ] = useState("");
  const [author, setAuthor] = useState("");
  const [sort, setSort] = useState<FnfSort>("fresh");
  const authors = useMemo(() => [...new Set(maps.fresh.map((m) => m.author))].sort((a, b) => a.localeCompare(b)), [maps]);
  const needle = q.trim().toLocaleLowerCase();
  const shown = maps[sort].filter((m) => (!author || m.author === author) && (!needle || m.name.toLocaleLowerCase().includes(needle)));
  return (
    <DialogShell
      title={t("fnf.pick.title")}
      onClose={onClose}
      head={
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_200px]">
          <label className="relative flex items-center">
            <Icon name="search" className="pointer-events-none absolute left-3 z-10" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fnf.pick.search")} aria-label={t("fnf.pick.search")} className="pl-9" autoFocus />
          </label>
          <Select value={author} onChange={(e) => setAuthor(e.target.value)} aria-label={t("fnf.pick.author")}>
            <option value="">{t("fnf.pick.anyAuthor")}</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as FnfSort)} aria-label={t("fnf.pick.sort")}>
            <option value="fresh">{t("fnf.sort.fresh")}</option>
            <option value="popular">{t("fnf.sort.popular")}</option>
          </Select>
        </div>
      }
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={buttonClass("secondary", "m")}>
            {t("fnf.pick.close")}
          </button>
        </div>
      }
    >
      {shown.length ? (
        <ul className="flex flex-col gap-3">
          {shown.map((m) => (
            <li key={m.id}>
              <a href={playUrl(m.id)} className="flex flex-col gap-4 rounded-xl bg-inset p-3 ring-line-strong hover:ring-1 sm:flex-row sm:items-center">
                <MapThumb url={m.thumbUrl} sizes="(min-width: 640px) 208px, 100vw" className="w-full shrink-0 sm:w-52" label={t("fnf.noPreview")} />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="truncate type-heading-xs text-fg">{m.name}</span>
                    <span className="flex items-center gap-2 type-body-s text-fg-secondary">
                      <Icon name="user-muted" />
                      {m.author}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:max-w-80">
                    <Stat label={t("fnf.played")} value={m.plays ? plural(locale, "fnf.times", m.plays) : t("fnf.never")} />
                    <Stat label={t("fnf.record")} value={m.record === null ? "—" : plural(locale, "fnf.turns", m.record)} />
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body-m text-fg-secondary">{t("fnf.pick.empty")}</p>
      )}
    </DialogShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface px-3 py-2">
      <Eyebrow>{label}</Eyebrow>
      <span className="truncate type-heading-xxs text-fg">{value}</span>
    </div>
  );
}
