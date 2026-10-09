"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { makeT, type Locale } from "@/lib/i18n";
import type { EditorOptions } from "@/lib/missions";
import { deleteMission, setMissionArchived } from "@/lib/missions/actions";
import { buttonClass } from "../ui";
import { MissionEditor, type EditorTarget } from "./editor/MissionEditor";

type EditorViewer = { discordId: string; name: string; isAdmin: boolean };

/** «Добавить миссию» on the missions page (admins and @mission officer members). */
export function AddMissionButton({ options, viewer, locale, label }: { options: EditorOptions; viewer: EditorViewer; locale: Locale; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "m")}>
        {label}
      </button>
      {open && <MissionEditor options={options} viewer={viewer} locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The «…» on a mission's page: «Изменить» for its authors (with @mission officer) and admins;
 * archiving and deleting for admins. Only a mission that was never scheduled can be deleted.
 */
export function MissionMenu({
  mission,
  editing,
  options,
  viewer,
  canEdit,
  deletable,
  locale,
}: {
  mission: { id: string; name: string; archived: boolean };
  editing: EditorTarget | null;
  options: EditorOptions | null;
  viewer: EditorViewer;
  canEdit: boolean;
  deletable: boolean;
  locale: Locale;
}) {
  const t = useMemo(() => makeT(locale), [locale]);
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const confirmDelete = (e: FormEvent) => {
    if (!confirm(t("missionMenu.deleteConfirm", { name: mission.name }))) e.preventDefault();
  };
  const item = "flex min-h-10 w-full items-center rounded-md px-3 py-2 text-left type-label-s hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t("missionMenu.label")}
        title={t("missionMenu.label")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${buttonClass("secondary", "m")} w-11 px-0`}
      >
        …
      </button>
      {open && (
        // Opens rightwards: on narrower screens the button wraps to the start of its row.
        <div className="absolute top-12 left-0 z-30 flex w-64 flex-col gap-0.5 rounded-lg bg-surface p-1.5 shadow-floating ring-1 ring-line-strong">
          {canEdit && editing && options && (
            <button
              type="button"
              className={`${item} text-fg`}
              onClick={() => {
                setOpen(false);
                setEditorOpen(true);
              }}
            >
              {t("missionMenu.edit")}
            </button>
          )}
          {viewer.isAdmin && (
            <>
              <form action={setMissionArchived}>
                <input type="hidden" name="mission" value={mission.id} />
                <input type="hidden" name="archive" value={mission.archived ? "0" : "1"} />
                <button type="submit" className={`${item} text-fg`}>
                  {mission.archived ? t("missionMenu.restore") : t("missionMenu.archive")}
                </button>
              </form>
              <form action={deleteMission} onSubmit={confirmDelete}>
                <input type="hidden" name="mission" value={mission.id} />
                <button type="submit" disabled={!deletable} className={`${item} flex-col !items-start text-fg-danger`}>
                  {t("missionMenu.delete")}
                  {!deletable && <span className="type-caption text-fg-tertiary">{t("missionMenu.deleteBlocked")}</span>}
                </button>
              </form>
            </>
          )}
        </div>
      )}
      {editorOpen && editing && options && (
        <MissionEditor editing={editing} options={options} viewer={viewer} locale={locale} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
}
