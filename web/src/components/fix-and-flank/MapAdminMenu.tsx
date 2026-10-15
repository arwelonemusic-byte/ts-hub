"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { takeDownMap } from "@/lib/fix-and-flank/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { buttonClass } from "../ui";

/**
 * The «…» on a published map's page, for admins (user request 2026-10-15): «Удалить карту», after a confirm. It takes
 * the map down (lib/fix-and-flank/actions.ts `takeDownMap`) and goes back to the game's page.
 */
export function MapAdminMenu({ mapId, name, locale }: { mapId: string; name: string; locale: Locale }) {
  const t = useMemo(() => makeT(locale), [locale]);
  const [open, setOpen] = useState(false);
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
    if (!confirm(t("fnf.admin.deleteConfirm", { name }))) e.preventDefault();
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t("fnf.admin.menu")}
        title={t("fnf.admin.menu")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${buttonClass("secondary", "m")} w-11 px-0`}
      >
        …
      </button>
      {open && (
        // Opens leftwards: the button is at the right end of its row.
        <div className="absolute top-12 right-0 z-30 flex w-72 flex-col gap-0.5 rounded-lg bg-surface p-1.5 shadow-floating ring-1 ring-line-strong">
          <form action={takeDownMap} onSubmit={confirmDelete}>
            <input type="hidden" name="map" value={mapId} />
            <button type="submit" className="flex min-h-10 w-full flex-col items-start rounded-md px-3 py-2 text-left type-label-s text-fg-danger hover:bg-raised">
              {t("fnf.admin.delete")}
              <span className="type-caption text-fg-tertiary">{t("fnf.admin.deleteHint")}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
