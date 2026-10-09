"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { assignSlot, clearSlot, leaveSlot, takeSlot, type SlotState } from "@/lib/slots/actions";
import { buttonClass } from "../ui";

/** Error texts by SlotState error; "{name}" is replaced with the role or player name. */
export type SlotErrors = Record<NonNullable<SlotState>["error"], string>;

const errorText = (state: SlotState, errors: SlotErrors) => (state ? errors[state.error].replace("{name}", state.name ?? "") : null);

function Hidden({ eventId, position }: { eventId: string; position: string }) {
  return (
    <>
      <input type="hidden" name="event" value={eventId} />
      <input type="hidden" name="position" value={position} />
    </>
  );
}

/** «Занять» on a free slot, or «Покинуть» on the viewer's own. */
export function SlotButton({
  kind,
  eventId,
  position,
  label,
  errors,
}: {
  kind: "take" | "leave";
  eventId: string;
  position: string;
  label: string;
  errors: SlotErrors;
}) {
  const [state, action, pending] = useActionState(kind === "take" ? takeSlot : leaveSlot, null);
  const error = errorText(state, errors);
  return (
    <form action={action} className="flex min-w-0 items-center gap-2">
      <Hidden eventId={eventId} position={position} />
      {error && <span className="truncate type-caption text-fg-danger">{error}</span>}
      <button type="submit" disabled={pending} className={buttonClass(kind === "take" ? "primary" : "outline", "xs")}>
        {label}
      </button>
    </form>
  );
}

/** The hero's «Освободить слот»: the viewer leaves their slot in this game. */
export function LeaveSlotButton({ eventId, label, className }: { eventId: string; label: string; className: string }) {
  const [, action, pending] = useActionState(leaveSlot, null);
  return (
    <form action={action} className="flex flex-1">
      <input type="hidden" name="event" value={eventId} />
      <button type="submit" disabled={pending} className={`${className} flex-1`}>
        {label}
      </button>
    </form>
  );
}

export interface SlotMenuLabels {
  menu: string;
  assign: string;
  placeholder: string;
  clear: string;
  /** "{role}" is replaced with the slot's role. */
  clearConfirm: string;
}

/**
 * An admin's «…» on a slot: put a member in a free slot (the panel renders the
 * `hub-players` datalist of names) or empty a taken one.
 */
export function SlotAdminMenu({
  eventId,
  position,
  role,
  taken,
  labels,
  errors,
}: {
  eventId: string;
  position: string;
  role: string;
  taken: boolean;
  labels: SlotMenuLabels;
  errors: SlotErrors;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The menu closes once the action went through; an error keeps it open.
  const closing =
    (fn: typeof assignSlot) =>
    async (prev: SlotState, form: FormData): Promise<SlotState> => {
      const result = await fn(prev, form);
      if (!result) setOpen(false);
      return result;
    };
  const [assignState, assign, assigning] = useActionState(closing(assignSlot), null);
  const [clearState, clear, clearing] = useActionState(closing(clearSlot), null);
  const error = errorText(taken ? clearState : assignState, errors);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const confirmClear = (e: FormEvent) => {
    if (!confirm(labels.clearConfirm.replace("{role}", role))) e.preventDefault();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={labels.menu}
        title={labels.menu}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-6 items-center justify-center rounded-sm type-label-s text-fg-secondary hover:bg-raised hover:text-fg"
      >
        …
      </button>
      {open && (
        <div className="absolute top-7 right-0 z-20 flex w-64 flex-col gap-2 rounded-lg bg-surface p-3 shadow-floating ring-1 ring-line-strong">
          {taken ? (
            <form action={clear} onSubmit={confirmClear}>
              <Hidden eventId={eventId} position={position} />
              <button type="submit" disabled={clearing} className={`${buttonClass("outline", "s")} w-full`}>
                {labels.clear}
              </button>
            </form>
          ) : (
            <form action={assign} className="flex flex-col gap-2">
              <Hidden eventId={eventId} position={position} />
              <input
                name="name"
                list="hub-players"
                required
                autoFocus
                autoComplete="off"
                placeholder={labels.placeholder}
                aria-label={labels.placeholder}
                className="h-9 rounded-md border border-line bg-page px-2.5 type-body-s text-fg outline-none placeholder:text-fg-faint focus:border-line-strong"
              />
              <button type="submit" disabled={assigning} className={buttonClass("primary", "s")}>
                {labels.assign}
              </button>
            </form>
          )}
          {error && <p className="type-caption text-fg-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
