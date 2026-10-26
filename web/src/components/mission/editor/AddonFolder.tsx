"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { plural, type Locale, type T } from "@/lib/i18n";
import { importAddonFolder, type FolderImport } from "@/lib/missions/addonFolder";
import { buttonClass, Icon } from "../../ui";

/**
 * «Из папки аддона»: the author picks the mission's folder and the browser reads it (lib/missions/addonFolder).
 * `children` are the lines saying what was found.
 */
export function AddonFolder({
  scenarioId,
  text,
  onImport,
  children,
  t,
}: {
  scenarioId: string;
  text: string;
  onImport: (res: FolderImport) => void;
  children?: ReactNode;
  t: T;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setReading(true);
    onImport(await importAddonFolder(files, scenarioId).finally(() => setReading(false)));
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="type-label-m text-fg">{t("editor.folder.title")}</h3>
          <p className="type-body-s text-fg-secondary">{text}</p>
        </div>
        <button type="button" onClick={() => ref.current?.click()} disabled={reading} className={buttonClass("secondary", "m")}>
          {reading ? t("editor.folder.reading") : t("editor.folder.pick")}
        </button>
        <input
          ref={ref}
          type="file"
          className="hidden"
          onChange={onChange}
          // Folder picking isn't in React's input typings.
          {...({ webkitdirectory: "", directory: "" } as object)}
        />
      </div>
      {children && <ul className="flex flex-col gap-1.5 border-t border-line pt-3 type-body-s">{children}</ul>}
    </section>
  );
}

export function Found({ ok, children, t }: { ok: boolean; children: ReactNode; t: T }) {
  return (
    <li className={`flex items-start gap-2 ${ok ? "text-fg-label" : "text-fg-tertiary"}`}>
      {ok ? <Icon name="check-circle" className="mt-0.5" /> : <span className="w-4 shrink-0 text-center" aria-label={t("editor.folder.missing")}>–</span>}
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

/** What a folder gave for the slot template; `open`: its slots no role rule covered. */
export function SlotsFound({ imported, open, locale, t }: { imported: FolderImport; open: number; locale: Locale; t: T }) {
  const found = imported.squads;
  return (
    <Found ok={!!found} t={t}>
      {found
        ? `${t("editor.folder.slots", {
            path: found.path,
            squads: plural(locale, "editor.slots.squads", found.squads.length),
            slots: plural(locale, "missionPage.slots.count", found.squads.reduce((n, sq) => n + sq.slots.length, 0)),
          })} ${open ? plural(locale, "editor.folder.rolesOpen", open) : t("editor.folder.rolesDone")}`
        : imported.squadWorlds > 1
          ? t("editor.folder.slotsMany", { n: imported.squadWorlds })
          : t("editor.folder.noSlots")}
    </Found>
  );
}
