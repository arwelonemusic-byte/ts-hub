"use client";

import { useActionState, type FormEvent } from "react";
import { attachPlan, detachPlan, type AttachState } from "@/lib/plans/actions";
import { buttonClass } from "../ui";

export interface AttachErrors {
  invalid: string;
  /** "{code}" is replaced with the code (here and in wrongMap). */
  notFound: string;
  wrongMap: string;
  forbidden: string;
  /** Someone else attached a plan meanwhile. */
  taken: string;
}

function errorText(state: AttachState, errors: AttachErrors): string | null {
  return state ? errors[state.error].replace("{code}", state.code ?? "") : null;
}

/** Replacing or detaching the game's plan asks first. */
function confirmFirst(text: string | undefined) {
  return (e: FormEvent) => {
    if (text && !confirm(text)) e.preventDefault();
  };
}

/** «Прикрепить план»: paste the code the planner gave on push. */
export function AttachCodeForm({
  eventId,
  placeholder,
  label,
  confirmText,
  errors,
}: {
  eventId: string;
  placeholder: string;
  label: string;
  confirmText?: string;
  errors: AttachErrors;
}) {
  const [state, action, pending] = useActionState(attachPlan, null);
  const error = errorText(state, errors);
  return (
    <form action={action} onSubmit={confirmFirst(confirmText)} className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <input type="hidden" name="event" value={eventId} />
        <input
          name="code"
          maxLength={6}
          required
          // Checked before submit, so a malformed code never reaches the replace confirm.
          pattern="[A-Za-z0-9]{6}"
          title={errors.invalid}
          autoComplete="off"
          spellCheck={false}
          defaultValue={state?.code}
          placeholder={placeholder}
          aria-label={label}
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-page px-3 type-code tracking-[0.2em] text-fg uppercase outline-none placeholder:text-fg-faint focus:border-line-strong"
        />
        <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>
          {label}
        </button>
      </div>
      {error && <p className="type-caption text-fg-danger">{error}</p>}
    </form>
  );
}

/** An admin's «Открепить». */
export function DetachButton({ eventId, label, confirmText }: { eventId: string; label: string; confirmText: string }) {
  return (
    <form action={detachPlan} onSubmit={confirmFirst(confirmText)}>
      <input type="hidden" name="event" value={eventId} />
      <button type="submit" className={buttonClass("outline", "s")}>
        {label}
      </button>
    </form>
  );
}
