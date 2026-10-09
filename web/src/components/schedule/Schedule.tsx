"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cancelGame, rescheduleGame, scheduleGame, type ScheduleState } from "@/lib/events/actions";
import { time } from "@/lib/format";
import { makeT, type Locale, type T } from "@/lib/i18n";
import { mskDayKey } from "@/lib/schedule";
import { buttonClass } from "../ui";

/** A mission in the schedule dialog's picker. */
export interface MissionOption {
  id: string;
  name: string;
  mapLabel: string;
}

/** Prefill for the dialog: a mission, and/or an MSK date + time. */
export interface ScheduleInitial {
  missionId?: string;
  date?: string;
  time?: string;
}

/** The dialog's date + time fields for an instant (MSK). */
export const fieldsFor = (iso: string): ScheduleInitial => ({ date: mskDayKey(iso), time: time(iso) });

const FIELD =
  "h-11 w-full rounded-lg border border-line bg-page px-3 type-body-m text-fg outline-none [color-scheme:dark] focus:border-line-strong";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="flex w-full max-w-md flex-col gap-5 rounded-xl bg-surface p-6 shadow-floating ring-1 ring-line-strong">
        <h2 className="type-heading-m text-fg">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="type-eyebrow text-fg-tertiary">{label}</span>
      {children}
    </label>
  );
}

function DateTime({ initial, t }: { initial: ScheduleInitial; t: T }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("schedule.date")}>
        <input type="date" name="date" required defaultValue={initial.date} className={FIELD} />
      </Field>
      <Field label={t("schedule.time")}>
        <input type="time" name="time" required defaultValue={initial.time ?? "20:00"} className={FIELD} />
      </Field>
    </div>
  );
}

function Actions({ submit, pending, onClose, state, t }: { submit: string; pending: boolean; onClose: () => void; state: ScheduleState; t: T }) {
  return (
    <>
      {state && <p className="type-caption text-fg-danger">{t(`schedule.error.${state.error}`)}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass("secondary", "m")}>
          {t("schedule.cancel")}
        </button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>
          {submit}
        </button>
      </div>
    </>
  );
}

/** «Новая игра»: mission + MSK date and time. On success the action opens the new game's page. */
export function ScheduleDialog({
  missions,
  initial,
  locale,
  onClose,
}: {
  missions: MissionOption[];
  initial: ScheduleInitial;
  locale: Locale;
  onClose: () => void;
}) {
  const t = useMemo(() => makeT(locale), [locale]);
  const [state, action, pending] = useActionState(scheduleGame, null);
  return (
    <Modal title={t("schedule.title")} onClose={onClose}>
      <form action={action} className="flex flex-col gap-4">
        <Field label={t("schedule.mission")}>
          <select name="mission" required defaultValue={initial.missionId ?? ""} className={FIELD}>
            <option value="" disabled>
              {t("schedule.missionPick")}
            </option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.mapLabel}
              </option>
            ))}
          </select>
        </Field>
        <DateTime initial={initial} t={t} />
        <Actions submit={t("schedule.submit")} pending={pending} onClose={onClose} state={state} t={t} />
      </form>
    </Modal>
  );
}

/** A button that opens the schedule dialog (events page, mission page). */
export function ScheduleButton({
  missions,
  initial = {},
  locale,
  label,
  className,
}: {
  missions: MissionOption[];
  initial?: ScheduleInitial;
  locale: Locale;
  label: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open && <ScheduleDialog missions={missions} initial={initial} locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}

function RescheduleDialog({ eventId, startsAt, t, onClose }: { eventId: string; startsAt: string; t: T; onClose: () => void }) {
  const [state, action, pending] = useActionState(async (prev: ScheduleState, form: FormData) => {
    const result = await rescheduleGame(prev, form);
    if (!result) onClose();
    return result;
  }, null);
  return (
    <Modal title={t("schedule.reschedule.title")} onClose={onClose}>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="event" value={eventId} />
        <p className="type-body-s text-fg-secondary">{t("schedule.reschedule.note")}</p>
        <DateTime initial={fieldsFor(startsAt)} t={t} />
        <Actions submit={t("schedule.reschedule.submit")} pending={pending} onClose={onClose} state={state} t={t} />
      </form>
    </Modal>
  );
}

/** The admin's «…» on a scheduled game: change its time, or cancel it. */
export function EventAdminMenu({ eventId, startsAt, missionName, locale }: { eventId: string; startsAt: string; missionName: string; locale: Locale }) {
  const t = useMemo(() => makeT(locale), [locale]);
  const [open, setOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const confirmCancel = (e: FormEvent) => {
    if (!confirm(t("event.admin.cancelConfirm", { name: missionName }))) e.preventDefault();
  };
  const item = "flex h-10 w-full items-center rounded-md px-3 text-left type-label-s hover:bg-raised";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t("event.admin.menu")}
        title={t("event.admin.menu")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${buttonClass("secondary", "m")} w-11 px-0`}
      >
        …
      </button>
      {open && (
        <div className="absolute top-12 right-0 z-30 flex w-56 flex-col gap-0.5 rounded-lg bg-surface p-1.5 shadow-floating ring-1 ring-line-strong">
          <button
            type="button"
            className={`${item} text-fg`}
            onClick={() => {
              setOpen(false);
              setRescheduling(true);
            }}
          >
            {t("event.admin.reschedule")}
          </button>
          <form action={cancelGame} onSubmit={confirmCancel}>
            <input type="hidden" name="event" value={eventId} />
            <button type="submit" className={`${item} text-fg-danger`}>
              {t("event.admin.cancel")}
            </button>
          </form>
        </div>
      )}
      {rescheduling && <RescheduleDialog eventId={eventId} startsAt={startsAt} t={t} onClose={() => setRescheduling(false)} />}
    </div>
  );
}
