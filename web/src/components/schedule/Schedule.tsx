"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cancelGame, rescheduleGame, scheduleGame, type ScheduleState } from "@/lib/events/actions";
import { time } from "@/lib/format";
import { makeT, type Locale, type T } from "@/lib/i18n";
import { mskDayKey } from "@/lib/schedule";
import { buttonClass, Cover, Icon } from "../ui";

/** A mission in the schedule dialog's picker. */
export interface MissionOption {
  id: string;
  name: string;
  mapLabel: string;
  coverUrl: string | null;
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

function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col gap-5 rounded-xl bg-surface p-6 shadow-floating ring-1 ring-line-strong ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
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

function Actions({
  submit,
  pending,
  disabled = false,
  onClose,
  state,
  t,
}: {
  submit: string;
  pending: boolean;
  disabled?: boolean;
  onClose: () => void;
  state: ScheduleState;
  t: T;
}) {
  return (
    <>
      {state && <p className="type-caption text-fg-danger">{t(`schedule.error.${state.error}`)}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass("secondary", "m")}>
          {t("schedule.cancel")}
        </button>
        <button type="submit" disabled={pending || disabled} className={buttonClass("primary", "m")}>
          {submit}
        </button>
      </div>
    </>
  );
}

/**
 * «Новая игра»: MSK date and time, then the mission from a searchable grid of covers. On success
 * the action opens the new game's page.
 */
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
  const [picked, setPicked] = useState(initial.missionId ?? "");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? missions.filter((m) => `${m.name} ${m.mapLabel}`.toLowerCase().includes(s)) : missions;
  }, [q, missions]);
  return (
    <Modal title={t("schedule.title")} onClose={onClose} wide>
      <form action={action} className="flex min-h-0 flex-col gap-4">
        <input type="hidden" name="mission" value={picked} />
        <DateTime initial={initial} t={t} />
        {missions.length > 1 && (
          <span className="relative flex items-center">
            <Icon name="search" className="pointer-events-none absolute left-3" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("schedule.search")}
              aria-label={t("schedule.search")}
              className="h-11 w-full rounded-lg border border-line bg-page pr-3 pl-9 type-body-m text-fg outline-none placeholder:text-fg-faint focus:border-line-strong"
            />
          </span>
        )}
        <div role="radiogroup" aria-label={t("schedule.mission")} className="grid min-h-0 grid-cols-2 content-start gap-3 overflow-y-auto p-0.5 sm:grid-cols-3">
          {shown.map((m) => {
            const on = picked === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(m.id)}
                className={`flex min-w-0 flex-col gap-2 rounded-lg p-2 text-left ${on ? "bg-accent-subtle ring-2 ring-accent" : "ring-1 ring-line hover:ring-line-strong"}`}
              >
                <Cover mission={m} sizes="240px" noCoverLabel={t("past.noCover")} rounded="rounded-md" />
                <span className="flex min-w-0 flex-col px-0.5">
                  <span className={`truncate type-label-s ${on ? "text-fg-accent" : "text-fg"}`}>{m.name}</span>
                  <span className="truncate type-caption text-fg-tertiary">{m.mapLabel}</span>
                </span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="col-span-full py-6 text-center type-body-s text-fg-tertiary">{t("schedule.noMatch")}</p>}
        </div>
        <Actions submit={t("schedule.submit")} pending={pending} disabled={!picked} onClose={onClose} state={state} t={t} />
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
