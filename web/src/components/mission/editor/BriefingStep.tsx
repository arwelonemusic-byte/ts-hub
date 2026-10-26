"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { Locale, T } from "@/lib/i18n";
import type { FolderImport } from "@/lib/missions/addonFolder";
import type { MissionDraft } from "@/lib/missions/draft";
import { buttonClass } from "../../ui";
import { AddonFolder, Found, SlotsFound } from "./AddonFolder";
import { Check, Field, move, TextArea, TextInput, ToolButton } from "./fields";

/** The headings the catalogue's briefings use, offered for a new section. */
const SECTION_TITLES = ["Ситуация", "Задачи", "Враждебные силы", "Дружественные силы", "Поддержка", "Замечания"];

const kb = (chars: number) => `${(chars / 1024).toFixed(1)} КБ`;

/**
 * Step 2: the briefing and the Markers.layer. The author either points the dialog at the addon's
 * folder (the browser reads Briefing.conf, the scenario world's Markers.layer and its squads, which
 * `onImport` puts in the slot template) or types and uploads them; either way the form below is what
 * gets saved.
 */
export function BriefingStep({
  draft,
  set,
  hadLayer,
  imported,
  onImport,
  locale,
  t,
}: {
  draft: MissionDraft;
  set: (patch: Partial<MissionDraft>) => void;
  /** The mission already has a Markers.layer (editing). */
  hadLayer: boolean;
  /** The last folder picked on this step, and its slots left without a role. */
  imported: { res: FolderImport; open: number } | null;
  onImport: (res: FolderImport) => void;
  locale: Locale;
  t: T;
}) {
  const layerRef = useRef<HTMLInputElement>(null);
  const [layerName, setLayerName] = useState<string | null>(null);
  const res = imported?.res;
  const sections = draft.briefing.sections;
  const setSections = (next: MissionDraft["briefing"]["sections"]) => set({ briefing: { ...draft.briefing, sections: next } });
  const setSide = (side: "for" | "against", v: string) => set({ briefing: { ...draft.briefing, sides: { ...draft.briefing.sides, [side]: v } } });

  const onFolder = (res: FolderImport) => {
    onImport(res);
    const patch: Partial<MissionDraft> = {};
    if (res.briefing) patch.briefing = { ...draft.briefing, sections: res.briefing.sections };
    if (res.layer) {
      patch.markersLayer = res.layer.text;
      patch.planning = true;
      setLayerName(res.layer.path.split("/").pop() ?? "Markers.layer");
    }
    set(patch);
  };

  const onLayer = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    set({ markersLayer: await f.text() });
    setLayerName(f.name);
  };

  const layerState = typeof draft.markersLayer === "string" ? "new" : draft.markersLayer === undefined && hadLayer ? "kept" : "none";

  return (
    <div className="flex flex-col gap-6">
      <AddonFolder scenarioId={draft.scenarioId} text={t("editor.folder.text")} onImport={onFolder} t={t}>
        {res && (
          <>
            <Found ok={!!res.briefing} t={t}>
              {res.briefing ? t("editor.folder.briefing", { n: res.briefing.sections.length, path: res.briefing.path }) : t("editor.folder.noBriefing")}
            </Found>
            <Found ok={!!res.layer} t={t}>
              {res.layer
                ? t("editor.folder.layer", { path: res.layer.path })
                : res.layerCandidates > 1
                  ? t("editor.folder.layers", { n: res.layerCandidates })
                  : t("editor.folder.noLayer")}
            </Found>
            <SlotsFound imported={res} open={imported?.open ?? 0} locale={locale} t={t} />
            {!res.scenarioFound && <li className="type-caption text-fg-tertiary">{t("editor.folder.noScenario", { root: res.root })}</li>}
          </>
        )}
      </AddonFolder>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("briefing.for")}>
          <TextInput value={draft.briefing.sides.for} onChange={(e) => setSide("for", e.target.value)} placeholder={t("editor.brief.forPh")} />
        </Field>
        <Field label={t("briefing.against")}>
          <TextInput value={draft.briefing.sides.against} onChange={(e) => setSide("against", e.target.value)} placeholder={t("editor.brief.againstPh")} />
        </Field>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="type-eyebrow text-fg-tertiary">{t("editor.brief.sections")}</h3>
          <span className="type-caption text-fg-tertiary">{t("editor.brief.listHint")}</span>
        </div>
        {sections.map((s, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl bg-inset p-3">
            <div className="flex items-center gap-1">
              <TextInput
                dense
                list="editor-section-titles"
                value={s.title}
                onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                placeholder={t("editor.brief.titlePh")}
                className="type-label-s"
              />
              <ToolButton glyph="up" label={t("editor.up")} onClick={() => setSections(move(sections, i, -1))} disabled={i === 0} />
              <ToolButton glyph="down" label={t("editor.down")} onClick={() => setSections(move(sections, i, 1))} disabled={i === sections.length - 1} />
              <ToolButton glyph="close" label={t("editor.remove")} tone="danger" onClick={() => setSections(sections.filter((_, j) => j !== i))} />
            </div>
            <TextArea
              value={s.body}
              onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
              rows={Math.min(12, Math.max(3, s.body.split("\n").length + 1))}
            />
          </div>
        ))}
        <datalist id="editor-section-titles">
          {SECTION_TITLES.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => setSections([...sections, { title: SECTION_TITLES.find((x) => !sections.some((s) => s.title === x)) ?? "", body: "" }])}
          className={`${buttonClass("secondary", "s")} self-start`}
        >
          {t("editor.brief.add")}
        </button>
      </section>

      {/* A training needs no plan, so no Markers.layer. */}
      {!draft.training && (
      <section className="flex flex-col gap-3 rounded-xl bg-inset p-4">
        <h3 className="type-label-m text-fg">Markers.layer</h3>
        <Check checked={!draft.planning} onChange={(off) => set({ planning: !off })}>
          {t("editor.layer.noPlanning")}
        </Check>
        {draft.planning && (
          <div className="flex flex-wrap items-center gap-3">
            <span className={`min-w-0 flex-1 truncate type-body-s ${layerState === "none" ? "text-fg-tertiary" : "text-fg"}`}>
              {layerState === "new"
                ? `${layerName ?? "Markers.layer"} · ${kb((draft.markersLayer as string).length)}`
                : layerState === "kept"
                  ? t("editor.layer.kept")
                  : t("editor.layer.none")}
            </span>
            <button type="button" onClick={() => layerRef.current?.click()} className={buttonClass("secondary", "s")}>
              {layerState === "none" ? t("editor.layer.upload") : t("editor.layer.replace")}
            </button>
            {layerState === "new" && (
              <button type="button" onClick={() => set({ markersLayer: hadLayer ? undefined : null })} className={buttonClass("secondary", "s")}>
                {hadLayer ? t("editor.layer.undo") : t("editor.remove")}
              </button>
            )}
            <input ref={layerRef} type="file" accept=".layer" className="hidden" onChange={onLayer} />
          </div>
        )}
      </section>
      )}
    </div>
  );
}
