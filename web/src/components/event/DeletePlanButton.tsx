"use client";

import type { FormEvent } from "react";
import { deleteMissionPlan } from "@/lib/plans/actions";

/** An admin's «Удалить план» on a drawn plan's row (mission page), after a confirm. It only hides the plan. */
export function DeletePlanButton({ planId, label, confirmText }: { planId: string; label: string; confirmText: string }) {
  const ask = (e: FormEvent) => {
    if (!confirm(confirmText)) e.preventDefault();
  };
  return (
    <form action={deleteMissionPlan} onSubmit={ask}>
      <input type="hidden" name="plan" value={planId} />
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="inline-flex size-8 items-center justify-center rounded-md bg-raised text-fg-secondary hover:bg-danger-subtle hover:text-fg-danger"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
        </svg>
      </button>
    </form>
  );
}
