"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a scheduled game's page current while it's open: every few seconds (only while the
 * tab is visible) it asks whether the game's slots or plan changed, and re-renders the page
 * when they did. The new render brings the new `version`, which restarts the loop.
 */
export function LiveRefresh({ eventId, version, everyMs = 5000 }: { eventId: string; version: string; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      // A hidden tab stops checking; coming back checks at once (below).
      if (stopped || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/version`, { cache: "no-store" });
        if (res.ok) {
          const { version: now } = (await res.json()) as { version: string };
          if (!stopped && now !== version) router.refresh();
        }
      } catch {
        // Offline or a deploy restarting the server: try again next round.
      } finally {
        busy = false;
      }
      if (!stopped) timer = setTimeout(check, everyMs);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void check();
    };
    timer = setTimeout(check, everyMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [eventId, version, everyMs, router]);
  return null;
}
