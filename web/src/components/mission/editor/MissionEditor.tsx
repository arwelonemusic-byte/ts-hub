"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { makeT, type Locale } from "@/lib/i18n";
import type { EditorOptions } from "@/lib/missions";
import { saveMission } from "@/lib/missions/actions";
import { checkDraft, ERROR_STEP, normalizeDraft, type DraftError, type DraftStep, type MissionDraft, type WorkshopInfo } from "@/lib/missions/draft";
import { buttonClass } from "../../ui";
import { BriefingStep } from "./BriefingStep";
import { SlotsStep } from "./SlotsStep";
import { WorkshopStep } from "./WorkshopStep";

const STEPS: DraftStep[] = ["workshop", "briefing", "slots"];

const EMPTY: MissionDraft = {
  workshopGuid: "",
  scenarioId: "",
  name: "",
  mapKey: "",
  authors: [],
  tags: [],
  briefing: { sides: { for: "", against: "" }, sections: [] },
  planning: true,
  markersLayer: null,
  squads: [],
};

export interface EditorTarget {
  draft: MissionDraft;
  coverUrl: string | null;
  workshopUrl: string | null;
  hasMarkersLayer: boolean;
}

/**
 * «Добавить миссию» / «Изменить миссию»: a three-step dialog — the Workshop link, then the
 * briefing and Markers.layer, then the slot template. A new mission goes step by step; an edit
 * can jump between steps and save from any of them. Saving opens the mission's page.
 */
export function MissionEditor({
  editing,
  options,
  viewer,
  locale,
  onClose,
}: {
  editing?: EditorTarget;
  options: EditorOptions;
  viewer: { discordId: string; name: string; isAdmin: boolean };
  locale: Locale;
  onClose: () => void;
}) {
  const t = useMemo(() => makeT(locale), [locale]);
  const router = useRouter();
  // Whoever adds a mission starts as its author (an admin adding someone else's can take themselves off).
  const [draft, setDraft] = useState<MissionDraft>(() => editing?.draft ?? { ...EMPTY, authors: [{ name: viewer.name, discordId: viewer.discordId }] });
  const [info, setInfo] = useState<WorkshopInfo | null>(null);
  const [step, setStep] = useState<DraftStep>("workshop");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<MissionDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const problem: DraftError | null = useMemo(
    () => checkDraft(normalizeDraft(draft), options.maps.map((m) => m.key), !!editing?.hasMarkersLayer),
    [draft, options.maps, editing],
  );
  const takenScenario = !!info?.taken.some((x) => x.scenarioId === draft.scenarioId);
  // A step is done when no error belongs to it (or to an earlier one).
  const stepOk = (s: DraftStep) => {
    const upTo = STEPS.slice(0, STEPS.indexOf(s) + 1);
    if (upTo.includes("workshop") && takenScenario) return false;
    return !problem || !upTo.includes(ERROR_STEP[problem]);
  };
  const i = STEPS.indexOf(step);
  const canOpen = (s: DraftStep) => !!editing || STEPS.indexOf(s) <= i || STEPS.slice(0, STEPS.indexOf(s)).every(stepOk);

  const save = async () => {
    if (problem) {
      setStep(ERROR_STEP[problem]);
      return setError(t(`editor.error.${problem}`));
    }
    setSaving(true);
    setError(null);
    const res = await saveMission(draft).catch(() => ({ error: "failed" as const }));
    if ("error" in res) {
      setSaving(false);
      return setError(t(`editor.error.${res.error}`));
    }
    if (editing) {
      onClose();
      router.refresh();
    } else {
      router.push(`/missions/${res.id}`);
    }
  };

  const last = i === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(editing ? "editor.titleEdit" : "editor.titleNew")}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-surface shadow-floating ring-1 ring-line-strong"
      >
        <header className="flex flex-col gap-4 border-b border-line px-6 pt-6 pb-4">
          <h2 className="type-heading-m text-fg">{editing ? t("editor.titleEdit") : t("editor.titleNew")}</h2>
          <ol className="flex flex-wrap gap-x-6 gap-y-2">
            {STEPS.map((s, n) => {
              const active = s === step;
              const done = !active && n < i && stepOk(s);
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!canOpen(s)}
                    onClick={() => setStep(s)}
                    aria-current={active ? "step" : undefined}
                    className="flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full type-caption-strong ${
                        active ? "bg-accent text-fg-on-accent" : done ? "bg-accent-subtle text-fg-accent" : "bg-raised text-fg-secondary"
                      }`}
                    >
                      {done ? "✓" : n + 1}
                    </span>
                    <span className={`type-label-s ${active ? "text-fg" : "text-fg-secondary"}`}>{t(`editor.step.${s}`)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === "workshop" && (
            <WorkshopStep
              draft={draft}
              set={set}
              info={info}
              setInfo={setInfo}
              editing={editing ? { coverUrl: editing.coverUrl, workshopUrl: editing.workshopUrl } : null}
              options={options}
              viewer={viewer}
              t={t}
            />
          )}
          {step === "briefing" && <BriefingStep draft={draft} set={set} hadLayer={!!editing?.hasMarkersLayer} t={t} />}
          {step === "slots" && <SlotsStep draft={draft} set={set} roles={options.roles} editing={!!editing} locale={locale} t={t} />}
        </div>

        <footer className="flex flex-col gap-3 border-t border-line px-6 py-4">
          {error && <p className="type-caption text-fg-danger">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onClose} disabled={saving} className={buttonClass("secondary", "m")}>
              {t("schedule.cancel")}
            </button>
            <span className="flex-1" />
            {i > 0 && (
              <button type="button" onClick={() => setStep(STEPS[i - 1])} disabled={saving} className={buttonClass("secondary", "m")}>
                {t("editor.back")}
              </button>
            )}
            {!last && (
              <button
                type="button"
                onClick={() => setStep(STEPS[i + 1])}
                disabled={saving || !stepOk(step)}
                className={buttonClass(editing ? "secondary" : "primary", "m")}
              >
                {t("editor.next")}
              </button>
            )}
            {(last || editing) && (
              <button type="button" onClick={save} disabled={saving || takenScenario} className={buttonClass("primary", "m")}>
                {saving ? t("editor.saving") : editing ? t("editor.save") : t("editor.create")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
