"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { announceGame } from "@/lib/discord/actions";
import { buttonClass } from "../ui";

type ErrorKey = "forbidden" | "notConfigured" | "notFound" | "discord";

/** «Анонс в Дискорд» on an upcoming game (admins): posts after a confirm; the page then links to the post. */
export function AnnounceButton({
  eventId,
  labels,
}: {
  eventId: string;
  labels: { button: string; pending: string; confirm: string; errors: Record<ErrorKey, string> };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const announce = () => {
    if (!window.confirm(labels.confirm)) return;
    setError(null);
    start(async () => {
      const r = await announceGame(eventId);
      if ("error" in r) setError(labels.errors[r.error]);
      else router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={announce} disabled={pending} className={`${buttonClass("secondary", "m")} disabled:opacity-60`}>
        {pending ? labels.pending : labels.button}
      </button>
      {error && (
        <p role="alert" className="order-last basis-full type-caption text-fg-danger">
          {error}
        </p>
      )}
    </>
  );
}
