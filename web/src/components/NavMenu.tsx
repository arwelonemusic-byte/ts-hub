"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  external?: boolean;
  active?: boolean;
}

/**
 * The header nav below xl, where the centred row doesn't fit: a menu button that drops a panel under the
 * header with the same links, the same hairline before the other TS apps and the same new-tab icon.
 */
export function NavMenu({ items, labels }: { items: NavItem[]; labels: { open: string; close: string } }) {
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
    <div ref={root} className="xl:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="nav-menu"
        aria-label={open ? labels.close : labels.open}
        className={`flex size-11 items-center justify-center rounded-lg ${open ? "bg-raised" : "hover:bg-raised"}`}
      >
        <Icon name={open ? "close" : "menu"} className="size-5" />
      </button>
      {open && (
        // Absolute against the sticky header, full width, right under it.
        <nav id="nav-menu" className="absolute inset-x-0 top-full border-b border-line bg-surface px-4 py-2 shadow-floating md:px-6">
          {items.map((n, i) => [
            n.external && !items[i - 1]?.external && <div key="divider" aria-hidden className="mx-3.5 my-2 h-px bg-line-strong" />,
            <Link
              key={n.key}
              href={n.href}
              {...(n.external ? { target: "_blank", rel: "noreferrer" } : {})}
              onClick={() => setOpen(false)}
              aria-current={n.active ? "page" : undefined}
              className={`flex h-12 items-center gap-1.5 rounded-lg px-3.5 type-label-s ${
                n.active ? "bg-raised text-fg" : "text-fg-secondary hover:text-fg"
              }`}
            >
              {n.label}
              {n.external && <Icon name="external-ff" />}
            </Link>,
          ])}
        </nav>
      )}
    </div>
  );
}
