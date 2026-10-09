"use client";

import type { MouseEvent, ReactNode } from "react";

/** Scroll to the element with this id, then flash a yellow outline round it (the `attention` animation). */
function flashTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  history.replaceState(null, "", `#${id}`);
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
  return true;
}

/** A link to a section of the page («Занять слот», the hero's plan box) that scrolls there and flashes it. */
export function JumpLink({ target, className, children }: { target: string; className: string; children: ReactNode }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    if (flashTo(target)) e.preventDefault();
  };
  return (
    <a href={`#${target}`} onClick={go} className={className}>
      {children}
    </a>
  );
}
