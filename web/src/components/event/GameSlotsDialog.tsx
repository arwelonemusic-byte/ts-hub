"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { editGameSlots } from "@/lib/events/actions";
import type { T } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { squadsOf, type EditableSquad } from "@/lib/squads";
import type { Slot } from "@/lib/types";
import { DialogShell } from "../mission/editor/DialogShell";
import { SquadsEditor } from "../mission/editor/SquadsEditor";
import { buttonClass } from "../ui";

/** The game's slots as the editor holds them: existing ones keyed by position, with who's in them. */
const toSquads = (slots: Slot[]): EditableSquad[] =>
  squadsOf(slots).map((sq) => ({
    groupId: sq.groupId,
    name: sq.groupName,
    slots: sq.slots.map((s) => ({ key: s.id, role: s.role, ...(s.requiredRole ? { requiredRole: s.requiredRole } : {}), player: s.playerName })),
  }));

/** «Изменить слоты» (admin): rename this game's slots, add slots and squads (lib/events/actions `editGameSlots`). */
export function GameSlotsDialog({
  eventId,
  slots,
  roles,
  locale,
  t,
  onClose,
}: {
  eventId: string;
  slots: Slot[];
  roles: string[];
  locale: Locale;
  t: T;
  onClose: () => void;
}) {
  const router = useRouter();
  const initial = useMemo(() => toSquads(slots), [slots]);
  const [squads, setSquads] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(squads) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await editGameSlots(eventId, squads).catch(() => ({ error: "failed" as const }));
    setSaving(false);
    if (res) return setError(t(`editor.error.${res.error}`));
    onClose();
    router.refresh();
  };

  return (
    <DialogShell
      title={t("gameSlots.title")}
      head={<p className="type-body-s text-fg-secondary">{t("gameSlots.note")}</p>}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          {error && <p className="type-caption text-fg-danger">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className={buttonClass("secondary", "m")}>
              {t("schedule.cancel")}
            </button>
            <button type="button" onClick={save} disabled={saving || !changed} className={buttonClass("primary", "m")}>
              {saving ? t("editor.saving") : t("editor.save")}
            </button>
          </div>
        </>
      }
    >
      <SquadsEditor
        squads={squads}
        setSquads={(next) => {
          setSquads(next);
          setError(null);
        }}
        roles={roles}
        mode="game"
        locale={locale}
        t={t}
      />
    </DialogShell>
  );
}
