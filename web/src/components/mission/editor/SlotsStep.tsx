"use client";

import { useState } from "react";
import { plural, type Locale, type T } from "@/lib/i18n";
import type { MissionDraft } from "@/lib/missions/draft";
import { parseSlotText } from "@/lib/missions/slotText";
import type { MissionSquad } from "@/lib/types";
import { buttonClass } from "../../ui";
import { Check, move, Select, TextArea, TextInput, ToolButton } from "./fields";

/** The next free "1'N" squad id after the ones in use. */
function nextGroupId(squads: MissionSquad[]): string {
  const used = new Set(squads.map((s) => s.groupId));
  for (let n = 1; ; n++) if (!used.has(`1'${n}`)) return `1'${n}`;
}

/**
 * Step 3: the slot template — squads (HQ first), each a list of slots with the Discord role a
 * player needs. The slotting bot's text pastes straight in.
 */
export function SlotsStep({
  draft,
  set,
  roles,
  editing,
  locale,
  t,
}: {
  draft: MissionDraft;
  set: (patch: Partial<MissionDraft>) => void;
  roles: string[];
  editing: boolean;
  locale: Locale;
  t: T;
}) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const squads = draft.squads;
  const setSquads = (next: MissionSquad[]) => set({ squads: next });
  const setSquad = (i: number, patch: Partial<MissionSquad>) => setSquads(squads.map((sq, j) => (j === i ? { ...sq, ...patch } : sq)));
  const total = squads.reduce((n, sq) => n + sq.slots.length, 0);
  const parsed = pasting ? parseSlotText(text, roles) : [];

  return (
    <div className="flex flex-col gap-5">
      <Check checked={draft.noSlotting} onChange={(noSlotting) => set({ noSlotting })}>
        {t("editor.slots.none")}
      </Check>

      {!draft.noSlotting && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="type-body-s text-fg-secondary">
              {squads.length ? `${plural(locale, "editor.slots.squads", squads.length)} · ${plural(locale, "missionPage.slots.count", total)}` : t("editor.slots.empty")}
            </span>
            <button type="button" onClick={() => setPasting((v) => !v)} className={buttonClass("secondary", "s")}>
              {t("editor.slots.paste")}
            </button>
          </div>

          {pasting && (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line-strong p-4">
              <p className="type-body-s text-fg-secondary">{t("editor.slots.pasteHint")}</p>
              <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"1'1 | SL [@SL] | RED - FTL [@FTL] | RED - Rifleman [@Rifleman]"} className="type-code" />
              <div className="flex items-center justify-end gap-2">
                <span className="mr-auto type-caption text-fg-tertiary">
                  {parsed.length ? `${plural(locale, "editor.slots.squads", parsed.length)} · ${plural(locale, "missionPage.slots.count", parsed.reduce((n, s) => n + s.slots.length, 0))}` : ""}
                </span>
                <button type="button" onClick={() => setPasting(false)} className={buttonClass("secondary", "s")}>
                  {t("schedule.cancel")}
                </button>
                <button
                  type="button"
                  disabled={!parsed.length}
                  onClick={() => {
                    if (squads.length && !confirm(t("editor.slots.replaceConfirm"))) return;
                    setSquads(parsed);
                    setPasting(false);
                    setText("");
                  }}
                  className={buttonClass("primary", "s")}
                >
                  {t("editor.slots.apply")}
                </button>
              </div>
            </div>
          )}

          {squads.map((sq, i) => (
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
                <ToolButton glyph="up" label={t("editor.up")} onClick={() => setSquads(move(squads, i, -1))} disabled={i === 0} />
                <ToolButton glyph="down" label={t("editor.down")} onClick={() => setSquads(move(squads, i, 1))} disabled={i === squads.length - 1} />
                <ToolButton
                  glyph="copy"
                  label={t("editor.slots.duplicate")}
                  onClick={() => setSquads([...squads.slice(0, i + 1), { ...sq, groupId: nextGroupId(squads), slots: sq.slots.map((s) => ({ ...s })) }, ...squads.slice(i + 1)])}
                />
                <ToolButton glyph="close" label={t("editor.slots.removeSquad")} tone="danger" onClick={() => setSquads(squads.filter((_, j) => j !== i))} />
              </div>
              <div className="flex flex-col gap-1.5 border-t border-line pt-2">
                {sq.slots.map((s, k) => (
                  <div key={k} className="flex items-center gap-1">
                    <TextInput
                      dense
                      value={s.role}
                      onChange={(e) => setSquad(i, { slots: sq.slots.map((x, j) => (j === k ? { ...x, role: e.target.value } : x)) })}
                      placeholder={t("editor.slots.rolePh")}
                      aria-label={t("editor.slots.role")}
                    />
                    <Select
                      dense
                      value={s.requiredRole ?? ""}
                      onChange={(e) =>
                        setSquad(i, { slots: sq.slots.map((x, j) => (j === k ? { role: x.role, ...(e.target.value ? { requiredRole: e.target.value } : {}) } : x)) })
                      }
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
                    <ToolButton glyph="up" label={t("editor.up")} onClick={() => setSquad(i, { slots: move(sq.slots, k, -1) })} disabled={k === 0} />
                    <ToolButton glyph="close" label={t("editor.slots.removeSlot")} tone="danger" onClick={() => setSquad(i, { slots: sq.slots.filter((_, j) => j !== k) })} />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setSquad(i, { slots: [...sq.slots, { role: "", requiredRole: sq.slots.at(-1)?.requiredRole }] })}
                  className={`${buttonClass("secondary", "xs")} mt-1 self-start`}
                >
                  {t("editor.slots.addSlot")}
                </button>
              </div>
            </section>
          ))}

          <button
            type="button"
            onClick={() => setSquads([...squads, { groupId: nextGroupId(squads), name: "", slots: [{ role: "SL", requiredRole: roles.find((r) => r === "SL") }] }])}
            className={`${buttonClass("secondary", "s")} self-start`}
          >
            {t("editor.slots.addSquad")}
          </button>
          {editing && <p className="type-caption text-fg-tertiary">{t("editor.slots.editNote")}</p>}
        </>
      )}
    </div>
  );
}
