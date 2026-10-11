"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { T } from "@/lib/i18n";
import { comeToGame, skipGame } from "@/lib/slots/actions";
import { buttonClass, Icon } from "../ui";

/**
 * A training's card in the feed: «Придут N», then «Я приду!» (or «Не приду») next to «Подробнее». The card's months
 * are loaded once, so the count and the button update here as soon as the server says yes. «Подробнее» still
 * stretches over the card (opens the game); the sign-up button sits above it.
 */
export function CardRsvp({
  eventId,
  coming: comingAtLoad,
  count: countAtLoad,
  signedIn,
  t,
}: {
  eventId: string;
  coming: boolean;
  count: number;
  signedIn: boolean;
  t: T;
}) {
  const [coming, setComing] = useState(comingAtLoad);
  const [count, setCount] = useState(countAtLoad);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set("event", eventId);
      // Called directly (not useActionState), so it's always the action for the state shown now.
      const r = await (coming ? skipGame : comeToGame)(null, form);
      if (r) return setError(t(`rsvp.error.${r.error}`));
      setCount((n) => n + (coming ? -1 : 1));
      setComing(!coming);
    });
  };

  const above = "relative z-10 flex-1";
  return (
    <>
      <div className="flex w-full items-baseline justify-between rounded-lg bg-inset px-4 py-3">
        <span className="type-eyebrow text-fg-tertiary">{t("feed.coming")}</span>
        <span className="type-label-s text-fg">{count}</span>
      </div>
      <div className="flex w-full flex-wrap gap-2">
        {signedIn ? (
          <button type="button" onClick={toggle} disabled={pending} className={`${buttonClass(coming ? "danger" : "primary", "m")} ${above} disabled:opacity-60`}>
            {t(coming ? "rsvp.skip" : "rsvp.come")}
          </button>
        ) : (
          <a href="/api/auth/login" className={`${buttonClass("primary", "m")} ${above}`}>
            {t("rsvp.come")}
          </a>
        )}
        <Link href={`/events/${eventId}`} className={`${buttonClass("secondary", "m")} flex-1 after:absolute after:inset-0 after:rounded-xl`}>
          {t("feed.details")}
          <Icon name="arrow-right" />
        </Link>
        {error && (
          <p role="alert" className="relative z-10 basis-full type-caption text-fg-danger">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
