"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";
import { makeT, type Locale, type T } from "@/lib/i18n";
import { addMissionPlan, type AddPlanState } from "@/lib/plans/actions";
import { findMember, memberLabel, type MemberLite } from "@/lib/roster/match";
import { codeOnly } from "../event/PlanForms";
import { TextInput } from "./editor/fields";
import { buttonClass } from "../ui";

const ERRORS: Record<NonNullable<AddPlanState>["error"], string> = {
  invalid: "plan.error.invalid",
  notFound: "plan.error.notFound",
  wrongMap: "plan.error.wrongMap",
  forbidden: "plan.add.error.forbidden",
  noAuthor: "plan.add.error.noAuthor",
  duplicate: "plan.add.error.duplicate",
};

/**
 * The «Планы для этой миссии» heading with an admin's «Добавить план»: a planner code and the member who drew it,
 * picked from the member list (`addMissionPlan`). The form opens under the heading and closes once the plan is in.
 */
export function AddMissionPlan({ missionId, members, title, locale }: { missionId: string; members: MemberLite[]; title: ReactNode; locale: Locale }) {
  const t = makeT(locale);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {title}
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "s")}>
            {t("plan.add")}
          </button>
        )}
      </div>
      {/* Mounted only while open, so it starts empty each time. */}
      {open && <AddPlanForm missionId={missionId} members={members} t={t} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddPlanForm({ missionId, members, t, onClose }: { missionId: string; members: MemberLite[]; t: T; onClose: () => void }) {
  const [pick, setPick] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [state, action, pending] = useActionState(async (prev: AddPlanState, form: FormData) => {
    const result = await addMissionPlan(prev, form);
    if (!result) onClose();
    return result;
  }, null);
  const member = findMember(members, pick);
  // A name that isn't in the list is caught before submitting; the server's errors come after.
  const error = unknown ? t("plan.add.error.noAuthor") : state ? t(ERRORS[state.error], { code: state.code ?? "" }) : null;

  const check = (e: FormEvent) => {
    if (member) return;
    e.preventDefault();
    setUnknown(true);
  };

  return (
    <form action={action} onSubmit={check} className="flex flex-col gap-3 rounded-lg bg-inset p-4">
      <input type="hidden" name="mission" value={missionId} />
      <input type="hidden" name="author" value={member?.id ?? ""} />
      <datalist id="plan-authors">
        {members.map((m) => (
          <option key={m.id} value={memberLabel(m)} />
        ))}
      </datalist>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex flex-col gap-1.5 md:w-40">
          <span className="type-caption-strong text-fg-secondary">{t("plan.add.code")}</span>
          <input
            name="code"
            // No maxLength: it would cut a pasted "/syncplan ABCDEF" to "/SYNCP" before onChange sees it.
            onChange={(e) => {
              const v = codeOnly(e.currentTarget.value);
              if (v !== e.currentTarget.value) e.currentTarget.value = v;
            }}
            required
            autoFocus
            pattern="[A-Za-z0-9]{6}"
            title={t("plan.error.invalid")}
            autoComplete="off"
            spellCheck={false}
            // A submit resets the form; a refused code comes back.
            defaultValue={state?.code}
            placeholder={t("plan.codePlaceholder")}
            className="h-11 w-full rounded-lg border border-line bg-page px-3 type-code tracking-[0.2em] text-fg uppercase outline-none placeholder:text-fg-faint focus:border-line-strong"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="type-caption-strong text-fg-secondary">{t("plan.add.author")}</span>
          <TextInput
            list="plan-authors"
            value={pick}
            onChange={(e) => {
              setPick(e.target.value);
              setUnknown(false);
            }}
            required
            autoComplete="off"
            spellCheck={false}
            placeholder={t("plan.add.authorPlaceholder")}
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={`${buttonClass("primary", "m")} flex-1`}>
            {t("plan.add.submit")}
          </button>
          <button type="button" onClick={onClose} className={buttonClass("secondary", "m")}>
            {t("plan.add.cancel")}
          </button>
        </div>
      </div>
      {error ? <p className="type-caption text-fg-danger">{error}</p> : <p className="type-caption text-fg-secondary">{t("plan.add.hint")}</p>}
    </form>
  );
}
