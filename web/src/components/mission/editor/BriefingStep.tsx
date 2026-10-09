"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { T } from "@/lib/i18n";
import { importAddonFolder, type FolderImport } from "@/lib/missions/addonFolder";
import type { MissionDraft } from "@/lib/missions/draft";
import { buttonClass, Icon } from "../../ui";
import { Check, Field, move, TextArea, TextInput, ToolButton } from "./fields";

/** The headings the catalogue's briefings use, offered for a new section. */
const SECTION_TITLES = ["Ситуация", "Задачи", "Враждебные силы", "Дружественные силы", "Поддержка", "Замечания"];

const kb = (chars: number) => `${(chars / 1024).toFixed(1)} КБ`;

/**
 * Step 2: the briefing and the Markers.layer. The author either points the dialog at the addon's
 * folder (the browser reads Briefing.conf and the scenario world's Markers.layer) or types and
 * uploads them; either way the form below is what gets saved.
 */
export function BriefingStep({
  draft,
  set,
  hadLayer,
  t,
}: {
  draft: MissionDraft;
  set: (patch: Partial<MissionDraft>) => void;
  /** The mission already has a Markers.layer (editing). */
  hadLayer: boolean;
  t: T;
}) {
  const folderRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<FolderImport | null>(null);
  const [reading, setReading] = useState(false);
  const [layerName, setLayerName] = useState<string | null>(null);
  const sections = draft.briefing.sections;
  const setSections = (next: MissionDraft["briefing"]["sections"]) => set({ briefing: { ...draft.briefing, sections: next } });
  const setSide = (side: "for" | "against", v: string) => set({ briefing: { ...draft.briefing, sides: { ...draft.briefing.sides, [side]: v } } });

  const onFolder = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setReading(true);
    const res = await importAddonFolder(files, draft.scenarioId).finally(() => setReading(false));
    setImported(res);
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
      <section className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="type-label-m text-fg">{t("editor.folder.title")}</h3>
            <p className="type-body-s text-fg-secondary">{t("editor.folder.text")}</p>
          </div>
          <button type="button" onClick={() => folderRef.current?.click()} disabled={reading} className={buttonClass("secondary", "m")}>
            {reading ? t("editor.folder.reading") : t("editor.folder.pick")}
          </button>
          <input
            ref={folderRef}
            type="file"
            className="hidden"
            onChange={onFolder}
            // Folder picking isn't in React's input typings.
            {...({ webkitdirectory: "", directory: "" } as object)}
          />
        </div>
        {imported && (
          <ul className="flex flex-col gap-1.5 border-t border-line pt-3 type-body-s">
            <Found ok={!!imported.briefing} t={t}>
              {imported.briefing
                ? t("editor.folder.briefing", { n: imported.briefing.sections.length, path: imported.briefing.path })
                : t("editor.folder.noBriefing")}
            </Found>
            <Found ok={!!imported.layer} t={t}>
              {imported.layer
                ? t("editor.folder.layer", { path: imported.layer.path })
                : imported.layerCandidates > 1
                  ? t("editor.folder.layers", { n: imported.layerCandidates })
                  : t("editor.folder.noLayer")}
            </Found>
            {!imported.scenarioFound && (
              <li className="type-caption text-fg-tertiary">{t("editor.folder.noScenario", { root: imported.root })}</li>
            )}
          </ul>
        )}
      </section>

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
    </div>
  );
}

function Found({ ok, children, t }: { ok: boolean; children: ReactNode; t: T }) {
  return (
    <li className={`flex items-start gap-2 ${ok ? "text-fg-label" : "text-fg-tertiary"}`}>
      {ok ? <Icon name="check-circle" className="mt-0.5" /> : <span className="w-4 shrink-0 text-center" aria-label={t("editor.folder.missing")}>–</span>}
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}
