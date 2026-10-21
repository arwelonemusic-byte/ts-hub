"use client";

import { useMemo, useState } from "react";
import { makeT, plural, type Locale, type T } from "@/lib/i18n";
import type { BingoResult, BingoWinner } from "@/lib/types";
import { DialogShell } from "../mission/editor/DialogShell";
import { buttonClass } from "../ui";
import { BingoCard, FREE_CELL, lineCells } from "./BingoCard";

/** A line's four texts, the free centre left out. */
const lineTexts = (w: BingoWinner, line: number) =>
  lineCells(line)
    .filter((i) => i !== FREE_CELL)
    .map((i) => w.cells[i])
    .filter(Boolean)
    .join(" · ");

function lineName(line: number, t: T): string {
  if (line < 5) return t("bingo.line.row", { n: line + 1 });
  if (line < 10) return t("bingo.line.col", { n: line - 4 });
  return t(line === 10 ? "bingo.line.diag" : "bingo.line.anti");
}

/**
 * «Бинго» (user decision 2026-10-20, design A): who completed a line on their TS Bingo card, earliest first, each
 * with a thumbnail of the card; a row opens the whole card. Above «Ачивки» on a played game's page.
 */
export function BingoPanel({ bingo, locale }: { bingo: BingoResult; locale: Locale }) {
  const t = useMemo(() => makeT(locale), [locale]);
  const [open, setOpen] = useState<BingoWinner | null>(null);
  const { winners } = bingo;
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-inset p-6">
      {/* «Бинго 3»: the title and how many got a line (user request 2026-10-21). */}
      <h2 className="flex items-baseline gap-2 type-heading-m">
        <span className="text-fg">{t("bingo.title")}</span>
        <span className="text-fg-secondary">{winners.length}</span>
      </h2>
      {winners.length > 0 && (
        <div className="flex flex-col gap-2">
          {winners.map((w) => (
            <button
              key={w.playerName}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpen(w)}
              className="flex items-start gap-3 rounded-lg bg-page p-3 text-left ring-1 ring-transparent transition-shadow hover:ring-line-strong focus-visible:ring-line-accent focus-visible:outline-none"
            >
              <BingoCard card={w} size="mini" />
              {/* No time or «Первым» on the rows (user request 2026-10-21); they stay earliest first. */}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate type-label-m text-fg">{w.playerName}</span>
                  {w.count > 1 && (
                    <span className="shrink-0 rounded-xs bg-accent-subtle px-1.5 type-caption-strong text-fg-accent">{plural(locale, "bingo.lines", w.count)}</span>
                  )}
                </span>
                <span className="line-clamp-3 type-caption text-fg-secondary">{lineTexts(w, w.lines[0])}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <DialogShell
          title={t("bingo.card", { name: open.playerName })}
          onClose={() => setOpen(null)}
          footer={
            <div className="flex justify-end">
              <button type="button" onClick={() => setOpen(null)} className={buttonClass("secondary", "m")}>
                {t("bingo.close")}
              </button>
            </div>
          }
        >
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            {/* As tall as the dialog lets it be without scrolling (header and footer take about 12rem). */}
            <div className="w-full max-w-[min(400px,calc((92vh-12rem)*0.75))] shrink-0">
              <BingoCard card={open} size="full" />
            </div>
            <ul className="flex w-full flex-col gap-4">
              {open.lines.map((l) => (
                <li key={l} className="flex flex-col gap-1">
                  <span className="type-eyebrow text-fg-accent">{lineName(l, t)}</span>
                  <span className="type-body-s text-fg-body">{lineTexts(open, l)}</span>
                </li>
              ))}
            </ul>
          </div>
        </DialogShell>
      )}
    </section>
  );
}
