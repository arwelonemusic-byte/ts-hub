"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { finishGame, gameReplays, previewGame, type GamePreview, type ReplayCandidate } from "@/lib/events/finish";
import { duration, shortDate, time } from "@/lib/format";
import { makeT, plural, type Locale } from "@/lib/i18n";
import { DialogShell } from "../mission/editor/DialogShell";
import { buttonClass } from "../ui";

const MAX_PICK = 4;

/**
 * «Игра окончена» / «Пересчитать» (admin): tick the game's recordings (suggested ones are ticked), check
 * the numbers they give, save. lib/events/finish.ts does the work.
 */
function FinishGameDialog({ eventId, recompute, locale, onClose }: { eventId: string; recompute: boolean; locale: Locale; onClose: () => void }) {
  const t = useMemo(() => makeT(locale), [locale]);
  const router = useRouter();
  const [candidates, setCandidates] = useState<ReplayCandidate[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<GamePreview | null>(null);
  const [busy, setBusy] = useState<"load" | "check" | "save" | null>("load");
  const [error, setError] = useState<string | null>(null);
  const fail = (e: { error: string; event?: string }) => setError(t(`finish.error.${e.error}`, { event: e.event ?? "" }));

  useEffect(() => {
    let live = true;
    gameReplays(eventId)
      .catch(() => ({ error: "planner" as const }))
      .then((res) => {
        if (!live) return;
        setBusy(null);
        if ("error" in res) return fail(res);
        setCandidates(res.candidates);
        // A played game opens on its own recordings; a new one on the suggested ones.
        setPicked(res.current.length ? res.current : res.candidates.filter((c) => c.suggested).map((c) => c.code).slice(0, MAX_PICK));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open
  }, [eventId]);

  const toggle = (code: string) => {
    setPreview(null);
    setError(null);
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : p.length < MAX_PICK ? [...p, code] : p));
  };
  const check = async () => {
    setBusy("check");
    setError(null);
    const res = await previewGame(eventId, picked).catch(() => ({ error: "replay" as const }));
    setBusy(null);
    if ("error" in res) return fail(res);
    setPreview(res.preview);
  };
  const save = async () => {
    setBusy("save");
    setError(null);
    const res = await finishGame(eventId, picked).catch(() => ({ error: "replay" as const }));
    if (res) {
      setBusy(null);
      return fail(res);
    }
    onClose();
    router.refresh();
  };

  return (
    <DialogShell
      title={t(recompute ? "finish.titleRecompute" : "finish.title")}
      head={<p className="type-body-s text-fg-secondary">{t("finish.note")}</p>}
      busy={busy === "save"}
      onClose={onClose}
      footer={
        <>
          {error && <p className="type-caption text-fg-danger">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy === "save"} className={`${buttonClass("secondary", "m")} mr-auto`}>
              {t("schedule.cancel")}
            </button>
            <button type="button" onClick={check} disabled={!!busy || !picked.length} className={buttonClass(preview ? "secondary" : "primary", "m")}>
              {busy === "check" ? t("finish.checking") : t("finish.check")}
            </button>
            <button type="button" onClick={save} disabled={!!busy || !preview} className={buttonClass("primary", "m")}>
              {busy === "save" ? t("editor.saving") : t(recompute ? "finish.saveRecompute" : "finish.save")}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {busy === "load" && <p className="type-body-s text-fg-secondary">{t("finish.loading")}</p>}
        {candidates && !candidates.length && <p className="type-body-s text-fg-secondary">{t("finish.none")}</p>}
        {candidates && candidates.length > 0 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-2 type-eyebrow text-fg-tertiary">{t("finish.replays")}</legend>
            {candidates.map((c) => {
              const on = picked.includes(c.code);
              return (
                <label
                  key={c.code}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ${on ? "bg-accent-subtle ring-accent" : "bg-inset ring-line hover:ring-line-strong"}`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(c.code)} className="size-4 shrink-0 cursor-pointer accent-[var(--ts-color-bg-accent)]" />
                  <span className="w-16 shrink-0 type-code text-fg">{c.code}</span>
                  <span className="w-24 shrink-0 type-body-s text-fg-secondary">
                    {shortDate(c.startedAt).slice(0, 5)} {time(c.startedAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate type-body-s text-fg">{c.world.replace(/_/g, " ") || "—"}</span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {c.sameName && <Chip tone="ok">{t("finish.sameName")}</Chip>}
                    {c.sameMap === true && <Chip tone="ok">{t("finish.sameMap")}</Chip>}
                    {c.sameMap === false && <Chip tone="off">{t("finish.otherMap")}</Chip>}
                    {c.planCode && <Chip tone="plain">{t("finish.stamp", { code: c.planCode })}</Chip>}
                  </span>
                </label>
              );
            })}
            <p className="mt-1 type-caption text-fg-tertiary">{t("finish.pickHint", { n: MAX_PICK })}</p>
          </fieldset>
        )}

        {preview && (
          <section className="flex flex-col gap-3 rounded-xl bg-inset p-4">
            <h3 className="type-label-m text-fg">{t("finish.preview")}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 type-body-s">
              <dt className="text-fg-tertiary">{t("finish.time")}</dt>
              <dd className="text-fg">
                {shortDate(preview.startedAt)} {time(preview.startedAt)} – {time(preview.endedAt)} · {duration(preview.durationMin, locale)}
              </dd>
              <dt className="text-fg-tertiary">{t("finish.players")}</dt>
              <dd className="text-fg">{plural(locale, "feed.players", preview.roster.length)}</dd>
              <dt className="text-fg-tertiary">{t("totals.deaths")}</dt>
              <dd className="text-fg">{preview.deaths}</dd>
              <dt className="text-fg-tertiary">{t("totals.aiKilled")}</dt>
              <dd className="text-fg">{preview.aiKilled}</dd>
              <dt className="text-fg-tertiary">{t("event.plan")}</dt>
              <dd className="text-fg">
                {preview.plan ? `${preview.plan.code} · ${t(`finish.planFrom.${preview.plan.from}`)}` : t("finish.noPlan")}
              </dd>
            </dl>
            <p className="type-caption text-fg-secondary">{preview.roster.join(", ")}</p>
          </section>
        )}
      </div>
    </DialogShell>
  );
}

function Chip({ tone, children }: { tone: "ok" | "off" | "plain"; children: string }) {
  const cls = { ok: "bg-accent-subtle text-fg-accent", off: "bg-danger-subtle text-fg-danger", plain: "bg-raised text-fg-label" }[tone];
  return <span className={`rounded-sm px-1.5 py-0.5 type-tag ${cls}`}>{children}</span>;
}

/** The hero's «Игра окончена» (a started game) or a played game's «Пересчитать», admins only. */
export function FinishGameButton({
  eventId,
  recompute = false,
  locale,
  label,
  className,
}: {
  eventId: string;
  recompute?: boolean;
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
      {open && <FinishGameDialog eventId={eventId} recompute={recompute} locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}
