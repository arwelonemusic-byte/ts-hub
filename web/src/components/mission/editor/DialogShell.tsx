"use client";

import { useEffect, type ReactNode } from "react";

/**
 * The editing dialogs' frame (mission dialog, a game's slots): a fixed header and footer around a
 * body that scrolls. Escape or a click outside closes it, unless `busy` (saving).
 */
export function DialogShell({
  title,
  head,
  footer,
  busy = false,
  onClose,
  children,
}: {
  title: string;
  /** Under the title (the mission dialog's steps). */
  head?: ReactNode;
  footer: ReactNode;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-surface shadow-floating ring-1 ring-line-strong">
        <header className="flex flex-col gap-4 border-b border-line px-6 pt-6 pb-4">
          <h2 className="type-heading-m text-fg">{title}</h2>
          {head}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <footer className="flex flex-col gap-3 border-t border-line px-6 py-4">{footer}</footer>
      </div>
    </div>
  );
}
