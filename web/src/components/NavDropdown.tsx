"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NavItem } from "./NavMenu";
import { Icon } from "./ui";

/**
 * A header nav item that opens a menu of pages (desktop): «Мини-игры» → Fix & Flank. Same look as the other
 * nav links; the panel is the «…» menus' (outside click or Escape closes it).
 */
export function NavDropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-11 items-center gap-1.5 rounded-lg px-3.5 type-label-s ${
          item.active || open ? "bg-raised text-fg" : "text-fg-secondary hover:text-fg"
        }`}
      >
        {item.label}
        <Icon name="chevron-down" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute top-12 left-0 z-30 flex w-56 flex-col gap-0.5 rounded-lg bg-surface p-1.5 shadow-floating ring-1 ring-line-strong">
          {item.children?.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              aria-current={c.active ? "page" : undefined}
              className={`flex h-10 w-full items-center rounded-md px-3 text-left type-label-s hover:bg-raised ${c.active ? "text-fg-accent" : "text-fg"}`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
