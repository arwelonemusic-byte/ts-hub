import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Mission } from "@/lib/types";

/**
 * Mission cover. Covers carry the title printed on them, so they are always shown
 * whole (16:10, object-contain) — never cropped. No cover → map-art fallback.
 */
export function Cover({
  mission,
  sizes,
  className = "",
  noCoverLabel,
  priority,
  rounded = "rounded-lg",
}: {
  mission: Pick<Mission, "name" | "mapLabel" | "coverUrl">;
  sizes: string;
  className?: string;
  noCoverLabel: string;
  priority?: boolean;
  rounded?: "rounded-md" | "rounded-lg" | "rounded-xl";
}) {
  return (
    <div className={`relative aspect-[16/10] overflow-hidden bg-inset ${rounded} ${className}`}>
      {mission.coverUrl ? (
        <Image src={mission.coverUrl} alt={mission.name} fill sizes={sizes} priority={priority} className="object-contain" />
      ) : (
        <>
          <Image src="/covers/merak-sat.jpg" alt="" fill sizes={sizes} className="object-cover opacity-40" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center">
            <span className="type-heading-xs text-fg">{mission.name}</span>
            <span className="type-caption text-fg-secondary">
              {noCoverLabel} · {mission.mapLabel}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Figma "Tag": Neutral (filled) or Outline. */
export function Tag({ children, outline }: { children: ReactNode; outline?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 type-tag text-fg-label ${
        outline ? "border border-line-outline py-px" : "bg-raised py-0.5"
      }`}
    >
      {children}
    </span>
  );
}

/** Figma "Status chip": Accent for upcoming, Neutral for played. */
export function StatusChip({ tone, children }: { tone: "accent" | "neutral"; children: ReactNode }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-sm px-2 py-1 type-chip ${tone === "accent" ? "bg-accent text-fg-on-accent" : "bg-raised text-fg"}`}>
      {children}
    </span>
  );
}

export function Eyebrow({ children, className = "text-fg-tertiary" }: { children: ReactNode; className?: string }) {
  return <p className={`type-eyebrow ${className}`}>{children}</p>;
}

/**
 * 16px icon exported from the Figma file (public/icons). Colour is baked into each
 * SVG, so a slot that needs another colour gets its own export.
 */
export type IconName =
  | "arrow-right" | "arrow-right-dark" | "arrow-right-ff" | "calendar" | "check-circle" | "chevron-down" | "chevron-left" | "close"
  | "chevron-left-nav" | "chevron-right-nav" | "copy" | "external" | "external-ff" | "external-trailing"
  | "external-dark" | "map-pin" | "map-pin-muted" | "menu" | "pencil" | "plan-pending" | "play" | "play-light" | "search" | "user"
  | "user-login" | "user-muted" | "users-muted";

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <Image src={`/icons/${name}.svg`} alt="" width={16} height={16} className={`shrink-0 ${className}`} />;
}

/** Figma "Progress bar": 4px track, accent (slots) or success (attendance) fill. */
export function ProgressBar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "success" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-[2px] bg-raised">
      <div className={`h-full ${tone === "accent" ? "bg-accent" : "bg-success"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "outline" | "danger";
type ButtonSize = "m" | "s" | "xs";

/** Figma "Button": M = 44px, S = 32px, XS = 24px (inline "Take"). */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "m"): string {
  const v = {
    primary: "bg-accent text-fg-on-accent hover:bg-accent-hover",
    secondary: "bg-raised text-fg hover:bg-raised-hover",
    outline: "border border-line-accent text-fg-accent hover:bg-accent-subtle",
    danger: "bg-danger text-fg-on-accent hover:brightness-110",
  }[variant];
  const sz = {
    m: "h-11 gap-2 rounded-lg px-4 type-label-s",
    s: `h-8 gap-2 rounded-md px-3 ${variant === "outline" ? "type-caption-strong" : "type-label-s"}`,
    xs: "h-6 gap-2 rounded-sm px-2 type-caption-strong",
  }[size];
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${v} ${sz}`;
}

export function ButtonLink({
  href,
  children,
  variant = "secondary",
  size = "m",
  external,
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  external?: boolean;
  className?: string;
}) {
  const cls = `${buttonClass(variant, size)} ${className}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  // Route handlers (e.g. the .ics download) need a plain anchor, not client navigation.
  if (href.startsWith("/api/") || href.endsWith(".ics")) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
