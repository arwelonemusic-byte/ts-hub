"use client";

import { useRef, useState } from "react";
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
 *   end. Additions can still be taken back before saving. Slots, old and new, are dragged into order inside
 *   their squad by the handle on the left (2026-10-12), whoever is in one moving with it.
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

  // Dragging a slot by its handle: the handle keeps the pointer, and the slot moves through its squad's list as the
  // pointer passes the middle of each other row.
  const rows = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<{ squad: number; at: number } | null>(null);
  const moveSlot = (i: number, from: number, to: number) => {
    const slots = [...squads[i].slots];
    const [s] = slots.splice(from, 1);
    slots.splice(to, 0, s);
    setSquad(i, { slots });
  };
  const dropAt = (i: number, from: number, y: number) =>
    squads[i].slots.filter((_, k) => {
      const r = k !== from && rows.current.get(`${i}:${k}`)?.getBoundingClientRect();
      return !!r && r.top + r.height / 2 < y;
    }).length;

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
                const dragged = drag?.squad === i && drag.at === k;
                return (
                  <div
                    key={k}
                    ref={(el) => {
                      if (el) rows.current.set(`${i}:${k}`, el);
                      else rows.current.delete(`${i}:${k}`);
                    }}
                    className={`flex items-center gap-1 rounded-lg ${dragged ? "bg-raised ring-1 ring-line-accent" : ""}`}
                  >
                    {game && (
                      <button
                        type="button"
                        aria-label={t("editor.slots.drag")}
                        title={t("editor.slots.drag")}
                        disabled={sq.slots.length < 2}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          setDrag({ squad: i, at: k });
                        }}
                        onPointerMove={(e) => {
                          if (drag?.squad !== i) return;
                          const to = dropAt(i, drag.at, e.clientY);
                          if (to === drag.at) return;
                          moveSlot(i, drag.at, to);
                          setDrag({ squad: i, at: to });
                        }}
                        onPointerUp={() => setDrag(null)}
                        onPointerCancel={() => setDrag(null)}
                        onKeyDown={(e) => {
                          const to = k + (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
                          if (to === k || to < 0 || to >= sq.slots.length) return;
                          e.preventDefault();
                          moveSlot(i, k, to);
                          // Rows are keyed by place, so the focus would stay put: follow the slot.
                          setTimeout(() => rows.current.get(`${i}:${to}`)?.querySelector("button")?.focus());
                        }}
                        className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-tertiary hover:text-fg active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
                      >
                        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
                          {[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />))}
                        </svg>
                      </button>
                    )}
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
