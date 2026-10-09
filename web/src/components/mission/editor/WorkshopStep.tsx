"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import type { T } from "@/lib/i18n";
import type { EditorOptions } from "@/lib/missions";
import { lookupWorkshop } from "@/lib/missions/actions";
import type { DraftAuthor, MissionDraft, WorkshopInfo } from "@/lib/missions/draft";
import { buttonClass, Cover } from "../../ui";
import { Field, Select, TextInput, ToolButton } from "./fields";

/** Step 1: the Workshop link fills in the addon, its scenario, title, cover and (from its dependencies) the map. */
export function WorkshopStep({
  draft,
  set,
  info,
  setInfo,
  editing,
  options,
  viewer,
  t,
}: {
  draft: MissionDraft;
  set: (patch: Partial<MissionDraft>) => void;
  info: WorkshopInfo | null;
  setInfo: (info: WorkshopInfo) => void;
  /** The mission as saved (editing only). */
  editing: { coverUrl: string | null; workshopUrl: string | null } | null;
  options: EditorOptions;
  viewer: { discordId: string; isAdmin: boolean };
  t: T;
}) {
  const [link, setLink] = useState(editing?.workshopUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    if (!link.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await lookupWorkshop(link, draft.id).catch(() => ({ error: "unreachable" as const }));
    setBusy(false);
    if ("error" in res) return setError(t(`editor.ws.error.${res.error}`));
    const found = res.info;
    setInfo(found);
    const sameAddon = found.guid === draft.workshopGuid;
    const free = found.scenarios.filter((s) => !found.taken.some((x) => x.scenarioId === s.id));
    const scenario =
      found.scenarios.find((s) => s.id === draft.scenarioId) ?? (found.scenarios.length === 1 ? found.scenarios[0] : free.length === 1 ? free[0] : null);
    set({
      workshopGuid: found.guid,
      scenarioId: scenario?.id ?? "",
      name: sameAddon && draft.name ? draft.name : found.title,
      mapKey: found.terrain.length === 1 ? found.terrain[0] : found.terrain.includes(draft.mapKey) || (editing && sameAddon) ? draft.mapKey : "",
      ...(editing ? { refreshCover: true } : {}),
    });
  };

  const shown = info !== null || editing !== null;
  const taken = info?.taken.find((x) => x.scenarioId === draft.scenarioId);
  const terrainHint = !info
    ? null
    : info.terrain.length === 1
      ? t("editor.ws.terrain.found")
      : info.terrain.length > 1
        ? t("editor.ws.terrain.several")
        : t("editor.ws.terrain.none");
  const mapOptions = info?.terrain.length ? [...options.maps].sort((a, b) => Number(!info.terrain.includes(a.key)) - Number(!info.terrain.includes(b.key))) : options.maps;

  return (
    <div className="flex flex-col gap-6">
      <Field label={t("editor.ws.link")} hint={t("editor.ws.linkHint")}>
        <span className="flex gap-2">
          <TextInput
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), find())}
            placeholder="https://reforger.armaplatform.com/workshop/…"
            autoFocus={!editing}
          />
          <button type="button" onClick={find} disabled={busy || !link.trim()} className={buttonClass(editing ? "secondary" : "primary", "m")}>
            {busy ? t("editor.ws.finding") : editing ? t("editor.ws.refresh") : t("editor.ws.find")}
          </button>
        </span>
      </Field>
      {error && <p className="-mt-3 type-caption text-fg-danger">{error}</p>}

      {shown && (
        <div className="flex flex-col gap-5 rounded-xl bg-inset p-4 sm:flex-row">
          <div className="w-full shrink-0 sm:w-[240px]">
            {info?.coverUrl ? (
              <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-page">
                <Image src={info.coverUrl} alt={draft.name} fill unoptimized className="object-contain" />
              </div>
            ) : (
              <Cover
                mission={{ name: draft.name || "—", mapLabel: options.maps.find((m) => m.key === draft.mapKey)?.label ?? "—", coverUrl: info ? null : (editing?.coverUrl ?? null) }}
                sizes="240px"
                noCoverLabel={t("past.noCover")}
              />
            )}
            {info && editing && <p className="mt-2 type-caption text-fg-tertiary">{t("editor.ws.coverRefresh")}</p>}
          </div>
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] content-start gap-x-4 gap-y-2.5 type-body-s">
            <dt className="text-fg-tertiary">{t("mission.guid")}</dt>
            <dd className="min-w-0 truncate type-code text-fg">{draft.workshopGuid || "—"}</dd>
            {info && (
              <>
                <dt className="self-center text-fg-tertiary">{t("editor.ws.scenario")}</dt>
                <dd className="min-w-0">
                  {info.scenarios.length > 1 ? (
                    <Select dense value={draft.scenarioId} onChange={(e) => set({ scenarioId: e.target.value })}>
                      <option value="">{t("editor.ws.scenarioPick")}</option>
                      {info.scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="block truncate text-fg">{info.scenarios[0]?.name}</span>
                  )}
                </dd>
              </>
            )}
            <dt className="text-fg-tertiary">{t("mission.scenario")}</dt>
            <dd className="min-w-0 truncate type-code text-fg-secondary" title={draft.scenarioId}>
              {draft.scenarioId || "—"}
            </dd>
          </dl>
        </div>
      )}
      {taken && (
        <p className="-mt-3 type-body-s text-fg-danger">
          {t("editor.ws.taken")}{" "}
          <Link href={`/missions/${taken.missionId}`} target="_blank" className="underline underline-offset-2">
            {taken.name}
          </Link>
        </p>
      )}

      {shown && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("editor.ws.name")}>
              <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} />
            </Field>
            <Field label={t("catalog.map")} hint={terrainHint}>
              <Select value={draft.mapKey} onChange={(e) => set({ mapKey: e.target.value })}>
                <option value="">{t("editor.ws.mapPick")}</option>
                {mapOptions.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Authors authors={draft.authors} set={(authors) => set({ authors })} options={options} viewer={viewer} t={t} />
          <Tags tags={draft.tags} set={(tags) => set({ tags })} options={options} t={t} />
        </>
      )}
    </div>
  );
}

const sameAuthor = (a: DraftAuthor, b: DraftAuthor) => (a.discordId && b.discordId ? a.discordId === b.discordId : a.name.toLowerCase() === b.name.toLowerCase());

/** Members by name from the list; anyone else goes in as a plain name. A mission maker can't take themselves off. */
function Authors({
  authors,
  set,
  options,
  viewer,
  t,
}: {
  authors: DraftAuthor[];
  set: (a: DraftAuthor[]) => void;
  options: EditorOptions;
  viewer: { discordId: string; isAdmin: boolean };
  t: T;
}) {
  const [q, setQ] = useState("");
  const add = () => {
    const name = q.trim();
    if (!name) return;
    const m = options.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const a: DraftAuthor = m ? { name: m.name, discordId: m.discordId } : { name };
    if (!authors.some((x) => sameAuthor(x, a))) set([...authors, a]);
    setQ("");
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };
  return (
    <Field label={t("editor.ws.authors")} hint={t("editor.ws.authorsHint")}>
      <span className="flex flex-wrap items-center gap-2">
        {authors.map((a, i) => (
          <span key={`${a.discordId ?? a.name}-${i}`} className="inline-flex h-8 items-center gap-1 rounded-md bg-raised pl-2.5 type-label-s text-fg">
            {a.name}
            {!a.discordId && <span className="type-caption text-fg-tertiary">· {t("editor.ws.notMember")}</span>}
            {viewer.isAdmin || a.discordId !== viewer.discordId ? (
              <ToolButton glyph="close" label={t("editor.remove")} onClick={() => set(authors.filter((_, j) => j !== i))} />
            ) : (
              <span className="w-2.5" />
            )}
          </span>
        ))}
        <span className="flex min-w-[220px] flex-1 gap-2">
          <TextInput dense list="editor-members" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t("editor.ws.authorAdd")} />
          <button type="button" onClick={add} disabled={!q.trim()} className={buttonClass("secondary", "s")}>
            {t("editor.add")}
          </button>
        </span>
      </span>
      <datalist id="editor-members">
        {options.members.map((m) => (
          <option key={m.discordId} value={m.name} />
        ))}
      </datalist>
    </Field>
  );
}

function Tags({ tags, set, options, t }: { tags: string[]; set: (t: string[]) => void; options: EditorOptions; t: T }) {
  const [q, setQ] = useState("");
  const all = [...new Set([...options.tags, ...tags])].sort((a, b) => a.localeCompare(b, "ru"));
  const toggle = (tag: string) => set(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag]);
  const add = () => {
    const tag = q.trim();
    if (tag && !tags.includes(tag)) set([...tags, tag]);
    setQ("");
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 type-eyebrow text-fg-tertiary">{t("catalog.tags")}</legend>
      <div className="flex flex-wrap items-center gap-1">
        {all.map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(tag)}
              className={`h-7 rounded-sm px-2 type-caption-strong ${on ? "bg-accent text-fg-on-accent" : "bg-page text-fg-label ring-1 ring-line hover:text-fg"}`}
            >
              {tag}
            </button>
          );
        })}
        <TextInput
          dense
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          onBlur={add}
          placeholder={t("editor.ws.tagAdd")}
          maxLength={24}
          className="!h-7 !w-36"
        />
      </div>
    </fieldset>
  );
}
