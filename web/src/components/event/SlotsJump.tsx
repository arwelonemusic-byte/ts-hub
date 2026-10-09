"use client";

import type { MouseEvent } from "react";

/** «Занять слот»: scrolls to the slots panel, then flashes a yellow outline round it. */
export function SlotsJump({ label, className }: { label: string; className: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById("slots");
    if (!el) return;
    e.preventDefault();
    history.replaceState(null, "", "#slots");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    let done = false;
    const flash = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scrollend", flash);
      // Re-adding the class restarts the animation on every click.
      el.classList.remove("animate-attention");
      void el.offsetWidth;
      el.classList.add("animate-attention");
      el.addEventListener("animationend", () => el.classList.remove("animate-attention"), { once: true });
    };
    // When the scroll lands; already there (no scroll) or no scrollend support: shortly after.
    window.addEventListener("scrollend", flash, { once: true });
    setTimeout(flash, 900);
  };
  return (
    <a href="#slots" onClick={go} className={className}>
      {label}
    </a>
  );
}
