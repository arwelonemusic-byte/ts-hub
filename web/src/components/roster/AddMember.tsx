"use client";

import { useActionState, useEffect, useState } from "react";
import { makeT, type Locale } from "@/lib/i18n";
import { addMember, type AddMemberState } from "@/lib/roster/actions";
import { Field, TextInput } from "../mission/editor/fields";
import { buttonClass } from "../ui";

/**
 * «Добавить участника» (admins, «Игроки»): a member's players row by Discord ID and display name, so they can be
 * seated in a slot before their first login. Discord's nickname and avatar win when the bot can fetch them; the
 * typed name is the fallback (dev, or Discord not answering).
 */
export function AddMember({ locale }: { locale: Locale }) {
  const t = makeT(locale);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "m")}>
        {t("players.add")}
      </button>
      {open && <AddMemberDialog locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddMemberDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const t = makeT(locale);
  const [state, action, pending] = useActionState<AddMemberState, FormData>(addMember, null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const added = state && "added" in state ? state.added : null;
  const error = state && "error" in state ? state : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("players.add")} className="flex w-full max-w-md flex-col gap-5 rounded-xl bg-surface p-6 shadow-floating ring-1 ring-line-strong">
        <h2 className="type-heading-m text-fg">{t("players.add")}</h2>
        {added ? (
          <>
            <p className="type-body-m text-fg">{t("players.added", { name: added })}</p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={buttonClass("primary", "m")}>
                {t("players.close")}
              </button>
            </div>
          </>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <p className="type-body-s text-fg-secondary">{t("players.addNote")}</p>
            <Field label={t("players.discordId")} hint={t("players.discordIdHint")}>
              <TextInput name="discordId" required inputMode="numeric" pattern="\d{17,20}" autoComplete="off" autoFocus placeholder="291374125451313153" />
            </Field>
            <Field label={t("players.displayName")} hint={t("players.displayNameHint")}>
              <TextInput name="name" required maxLength={100} autoComplete="off" />
            </Field>
            {error && (
              <p role="alert" className="type-caption text-fg-danger">
                {t(`players.addError.${error.error}`, { name: error.name ?? "" })}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={buttonClass("secondary", "m")}>
                {t("players.cancel")}
              </button>
              <button type="submit" disabled={pending} className={`${buttonClass("primary", "m")} disabled:opacity-60`}>
                {t("players.addSubmit")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
