"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { catalogSearch, catalogTags, filterCatalog, type CatalogMission, type CatalogQuery } from "@/lib/catalog";
import { makeT, type Locale } from "@/lib/i18n";
import { buttonClass, Cover, Icon } from "../ui";

const EMPTY: CatalogQuery = { q: "", map: "", author: "", tags: [] };

/** Figma "Missions · List" (node 52:1362): filter rail on the left, mission cards on the right. */
export function MissionCatalog({ missions, initial, locale }: { missions: CatalogMission[]; initial: CatalogQuery; locale: Locale }) {
  const t = makeT(locale);
  const [query, setQuery] = useState(initial);
  const update = (patch: Partial<CatalogQuery>) => {
    const next = { ...query, ...patch };
    setQuery(next);
    window.history.replaceState(null, "", catalogSearch(next) || window.location.pathname);
  };

  const shown = filterCatalog(missions, query);
  const maps = [...new Map(missions.map((m) => [m.mapKey, m.mapLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  const authors = [...new Set(missions.flatMap((m) => m.authors))].sort((a, b) => a.localeCompare(b, "ru"));
  const tags = catalogTags(missions);
  const filtered = !!(query.q || query.map || query.author || query.tags.length);
  const reset = () => update(EMPTY);
  const toggleTag = (tag: string) =>
    update({ tags: query.tags.includes(tag) ? query.tags.filter((x) => x !== tag) : [...query.tags, tag] });

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <aside aria-label={t("catalog.filters")} className="flex w-full shrink-0 flex-col gap-6 rounded-xl bg-surface p-5 lg:w-[280px]">
        <div className="flex items-baseline justify-between">
          <h2 className="type-heading-xs text-fg">{t("catalog.filters")}</h2>
          {filtered && (
            <button type="button" onClick={reset} className="type-caption-strong text-fg-accent">
              {t("catalog.reset")}
            </button>
          )}
        </div>
        <Field label={t("catalog.search")}>
          <span className="relative flex items-center">
            <Icon name="search" className="pointer-events-none absolute left-3" />
            <input
              type="search"
              value={query.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder={t("catalog.searchPlaceholder")}
              className="h-11 w-full rounded-lg border border-line bg-page pl-9 pr-3 type-body-m text-fg outline-none placeholder:text-fg-faint focus:border-line-strong"
            />
          </span>
        </Field>
        <Field label={t("catalog.map")}>
          <Select value={query.map} onChange={(map) => update({ map })}>
            <option value="">{t("catalog.map.all")}</option>
            {maps.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("catalog.author")}>
          <Select value={query.author} onChange={(author) => update({ author })}>
            <option value="">{t("catalog.author.all")}</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 type-eyebrow text-fg-tertiary">{t("catalog.tags")}</legend>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => {
              const on = query.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(tag)}
                  className={`h-6 rounded-sm px-2 type-caption-strong ${on ? "bg-raised text-fg" : "bg-inset text-fg-label hover:text-fg"}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </fieldset>
      </aside>

      <section aria-label={t("nav.missions")} className="flex min-w-0 flex-1 flex-col gap-4">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-12 text-center">
            <span className="type-label-m text-fg-label">{t("catalog.empty")}</span>
            <button type="button" onClick={reset} className={buttonClass("secondary", "m")}>
              {t("catalog.emptyReset")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {shown.map((m, i) => (
              <MissionCard key={m.id} mission={m} noCoverLabel={t("past.noCover")} priority={i < 3} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="type-eyebrow text-fg-tertiary">{label}</span>
      {children}
    </label>
  );
}

/** Figma "Select" (M): fills a filter field on the page background. */
function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <span className="relative flex w-full items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full cursor-pointer appearance-none rounded-lg border border-line bg-page pr-9 pl-3 type-body-m text-fg outline-none focus:border-line-strong"
      >
        {children}
      </select>
      <Icon name="chevron-down" className="pointer-events-none absolute right-2.5" />
    </span>
  );
}

/** Missions only: cover, title, map and author — no game details. */
function MissionCard({ mission: m, noCoverLabel, priority }: { mission: CatalogMission; noCoverLabel: string; priority: boolean }) {
  return (
    <Link href={`/missions/${m.id}`} className="flex flex-col gap-3 rounded-xl bg-surface p-3 ring-line-strong hover:ring-1">
      <Cover mission={m} sizes="(min-width: 1024px) 267px, (min-width: 640px) 50vw, 100vw" noCoverLabel={noCoverLabel} priority={priority} />
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        <span className="type-heading-xs text-fg">{m.name}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 type-body-s text-fg-secondary">
          <span className="flex items-center gap-1.5">
            <Icon name="map-pin-muted" />
            {m.mapLabel}
          </span>
          {m.authors.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Icon name="user-muted" />
              {m.authors.join(", ")}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
