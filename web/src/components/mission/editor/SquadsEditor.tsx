"use client";

import { plural, type Locale, type T } from "@/lib/i18n";
import type { EditableSlot, EditableSquad } from "@/lib/squads";
import { buttonClass } from "../../ui";
import { move, Select, TextInput, ToolButton } from "./fields";

/** The next free "1'N" squad id after the ones in use. */
function nextGroupId(squads: EditableSquad[]): string {
  const used = new Set(squads.map((s) => s.groupId));
  for (let n = 1; ; n++) if (!used.has(`1'${n}`)) return `1'${n}`;
}

/** A squad's slots as new ones (a duplicate): same names and roles, nobody in them. */
const fresh = (slots: EditableSlot[]): EditableSlot[] => slots.map((s) => ({ role: s.role, ...(s.requiredRole ? { requiredRole: s.requiredRole } : {}) }));

/**
 * Squads and their slots, each slot with the Discord role a player needs.
 * - `mission`: a mission's slot template (step 3 of the mission dialog) — anything goes. No squads = played
 *   without slotting.
 * - `game`: a scheduled game's own slots (user decisions 2026-10-09). A slot that exists can be renamed,
 *   never deleted, and keeps its required role; squads (new or duplicated) and slots are only added, at the
 *   end. Additions can still be taken back before saving.
 */
export function SquadsEditor({
  squads,
  setSquads,
  roles,
  mode,
  locale,
  t,
}: {
  squads: EditableSquad[];
  setSquads: (next: EditableSquad[]) => void;
  roles: string[];
  mode: "mission" | "game";
  locale: Locale;
  t: T;
}) {
  const game = mode === "game";
  const setSquad = (i: number, patch: Partial<EditableSquad>) => setSquads(squads.map((sq, j) => (j === i ? { ...sq, ...patch } : sq)));
  const total = squads.reduce((n, sq) => n + sq.slots.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <span className="type-body-s text-fg-secondary">
        {squads.length ? `${plural(locale, "editor.slots.squads", squads.length)} · ${plural(locale, "missionPage.slots.count", total)}` : t("editor.slots.empty")}
      </span>

      {squads.map((sq, i) => {
        const fixed = sq.slots.some((s) => s.key);
        return (
          <section key={i} className="flex flex-col gap-2 rounded-xl bg-inset p-3">
            <div className="flex items-center gap-1">
              <TextInput
                dense
                value={sq.groupId}
                onChange={(e) => setSquad(i, { groupId: e.target.value })}
                placeholder="1'1"
                aria-label={t("editor.slots.groupId")}
                title={t("editor.slots.groupId")}
                className="!w-24 shrink-0 type-label-s"
              />
              <TextInput
                dense
                value={sq.name}
                onChange={(e) => setSquad(i, { name: e.target.value })}
                placeholder={t("editor.slots.groupName")}
                aria-label={t("editor.slots.groupName")}
              />
              {!game && (
                <>
                  <ToolButton glyph="up" label={t("editor.up")} onClick={() => setSquads(move(squads, i, -1))} disabled={i === 0} />
                  <ToolButton glyph="down" label={t("editor.down")} onClick={() => setSquads(move(squads, i, 1))} disabled={i === squads.length - 1} />
                </>
              )}
              <ToolButton
                glyph="copy"
                label={t("editor.slots.duplicate")}
                onClick={() => {
                  const copy = { groupId: nextGroupId(squads), name: sq.name, slots: fresh(sq.slots) };
                  // A game's new squads go at the end; a template's copy goes next to its original.
                  setSquads(game ? [...squads, copy] : [...squads.slice(0, i + 1), copy, ...squads.slice(i + 1)]);
                }}
              />
              {!fixed && (
                <ToolButton glyph="close" label={t("editor.slots.removeSquad")} tone="danger" onClick={() => setSquads(squads.filter((_, j) => j !== i))} />
              )}
            </div>
            <div className="flex flex-col gap-1.5 border-t border-line pt-2">
              {sq.slots.map((s, k) => {
                const setSlot = (patch: Partial<EditableSlot>) => setSquad(i, { slots: sq.slots.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
                return (
                  <div key={k} className="flex items-center gap-1">
                    <TextInput dense value={s.role} onChange={(e) => setSlot({ role: e.target.value })} placeholder={t("editor.slots.rolePh")} aria-label={t("editor.slots.role")} />
                    {s.key ? (
                      // An existing game slot keeps its role (and whoever is in it).
                      <span className="flex h-9 w-40 shrink-0 items-center rounded-lg bg-page px-2.5 type-body-s text-fg-tertiary" title={t("editor.slots.roleFixed")}>
                        {s.requiredRole ? `@${s.requiredRole}` : t("editor.slots.anyone")}
                      </span>
                    ) : (
                      <Select
                        dense
                        value={s.requiredRole ?? ""}
                        onChange={(e) => setSquad(i, { slots: sq.slots.map((x, j) => (j === k ? { role: x.role, ...(e.target.value ? { requiredRole: e.target.value } : {}) } : x)) })}
                        aria-label={t("editor.slots.required")}
                        title={t("editor.slots.required")}
                        className="w-40 shrink-0"
                      >
                        <option value="">{t("editor.slots.anyone")}</option>
                        {[...new Set([...roles, ...(s.requiredRole && !roles.includes(s.requiredRole) ? [s.requiredRole] : [])])].map((r) => (
                          <option key={r} value={r}>
                            @{r}
                          </option>
                        ))}
                      </Select>
                    )}
                    {game ? (
                      s.key ? (
                        <span className="w-28 shrink-0 truncate pl-1.5 type-caption text-fg-tertiary" title={s.player ?? undefined}>
                          {s.player ?? t("editor.slots.free")}
                        </span>
                      ) : (
                        <span className="flex w-28 shrink-0 items-center gap-1 pl-1.5">
                          <span className="flex-1 type-caption text-fg-accent">{t("editor.slots.new")}</span>
                          <ToolButton glyph="close" label={t("editor.slots.removeSlot")} tone="danger" onClick={() => setSquad(i, { slots: sq.slots.filter((_, j) => j !== k) })} />
                        </span>
                      )
                    ) : (
                      <>
                        <ToolButton glyph="up" label={t("editor.up")} onClick={() => setSquad(i, { slots: move(sq.slots, k, -1) })} disabled={k === 0} />
                        <ToolButton glyph="close" label={t("editor.slots.removeSlot")} tone="danger" onClick={() => setSquad(i, { slots: sq.slots.filter((_, j) => j !== k) })} />
                      </>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setSquad(i, { slots: [...sq.slots, { role: "", ...(sq.slots.at(-1)?.requiredRole ? { requiredRole: sq.slots.at(-1)!.requiredRole } : {}) }] })}
                className={`${buttonClass("secondary", "xs")} mt-1 self-start`}
              >
                {t("editor.slots.addSlot")}
              </button>
            </div>
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => setSquads([...squads, { groupId: nextGroupId(squads), name: "", slots: [{ role: "SL", ...(roles.includes("SL") ? { requiredRole: "SL" } : {}) }] }])}
        className={`${buttonClass("secondary", "s")} self-start`}
      >
        {t("editor.slots.addSquad")}
      </button>
    </div>
  );
}
