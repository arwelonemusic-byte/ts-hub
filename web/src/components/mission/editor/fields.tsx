"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "../../ui";

/* The add/edit dialog's form controls, in the hub's filter-field style (page background, 1px line). */

const BOX = "w-full rounded-lg border border-line bg-page text-fg outline-none placeholder:text-fg-faint focus:border-line-strong";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="type-eyebrow text-fg-tertiary">{label}</span>
      {children}
      {hint && <span className="type-caption text-fg-tertiary">{hint}</span>}
    </label>
  );
}

/** `dense`: the 36px row size (slot rows), else 44px. */
export function TextInput({ dense, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { dense?: boolean }) {
  return <input {...props} className={`${BOX} ${dense ? "h-9 px-2.5 type-body-s" : "h-11 px-3 type-body-m"} ${className}`} />;
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${BOX} min-h-24 resize-y px-3 py-2.5 type-body-m ${className}`} />;
}

export function Select({ dense, className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { dense?: boolean }) {
  return (
    <span className={`relative flex min-w-0 items-center ${className}`}>
      <select
        {...props}
        className={`${BOX} cursor-pointer appearance-none pr-8 ${dense ? "h-9 pl-2.5 type-body-s" : "h-11 pl-3 type-body-m"} [color-scheme:dark]`}
      >
        {children}
      </select>
      <Icon name="chevron-down" className="pointer-events-none absolute right-2.5" />
    </span>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 type-body-m text-fg-label">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--ts-color-bg-accent)]" />
      <span>{children}</span>
    </label>
  );
}

const GLYPHS = {
  up: "M4 10l4-4 4 4",
  down: "M4 6l4 4 4-4",
  close: "M4.5 4.5l7 7m0-7l-7 7",
  plus: "M8 3.5v9M3.5 8h9",
  copy: "M5.5 5.5V3.5h7v7h-2M3.5 5.5h7v7h-7z",
} as const;

/** A 32px square button with a stroked glyph, for row tools (move, duplicate, remove). */
export function ToolButton({
  glyph,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  glyph: keyof typeof GLYPHS;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md disabled:opacity-30 ${
        tone === "danger" ? "text-fg-secondary hover:bg-danger-subtle hover:text-fg-danger" : "text-fg-secondary hover:bg-raised hover:text-fg"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={GLYPHS[glyph]} />
      </svg>
    </button>
  );
}

/** Moves item `i` of a list by `by` (−1 up, +1 down). */
export function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
