import Image from "next/image";
import type { CSSProperties } from "react";
import type { BingoWinner } from "@/lib/types";

/** The card art is 1536×2048; its cells, as the mod's layout places them (ts-bingo/tools/make_layout.mjs COLS/ROWS). */
const W = 1536;
const H = 2048;
const COLS = [[194, 419], [425, 650], [656, 881], [887, 1112], [1118, 1343]];
const ROWS = [[731, 956], [962, 1187], [1193, 1418], [1424, 1649], [1655, 1880]];
export const FREE_CELL = 12;

/** Cells of a line as the mod numbers them (TS_BingoCardComponent.LineCells): 0-4 rows, 5-9 columns, 10 and 11 the diagonals. */
export function lineCells(line: number): number[] {
  return [0, 1, 2, 3, 4].map((k) => (line < 5 ? line * 5 + k : line < 10 ? k * 5 + (line - 5) : line === 10 ? k * 6 : 4 + k * 4));
}

const col = (i: number) => COLS[i % 5];
const row = (i: number) => ROWS[Math.floor(i / 5)];
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function cellBox(i: number): CSSProperties {
  const [x0, x1] = col(i);
  const [y0, y1] = row(i);
  return { left: pct(x0, W), top: pct(y0, H), width: pct(x1 - x0, W), height: pct(y1 - y0, H) };
}

const centre = (i: number) => ({ x: (col(i)[0] + col(i)[1]) / 2, y: (row(i)[0] + row(i)[1]) / 2 });

/** A marker stroke through a line, a little past its end cells. */
function Stroke({ line }: { line: number }) {
  const cells = lineCells(line);
  const a = centre(cells[0]);
  const b = centre(cells[4]);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ex = ((b.x - a.x) / len) * 70;
  const ey = ((b.y - a.y) / len) * 70;
  return <line x1={a.x - ex} y1={a.y - ey} x2={b.x + ex} y2={b.y + ey} />;
}

/**
 * A TS Bingo card as the player saw it: the mod's card art with the cells drawn over it.
 * mini: the completed lines' cells yellow, the other crossed ones red, no text (a row's thumbnail).
 * full: the texts, a red cross on every crossed cell and a yellow marker through each completed line.
 * Decorative for screen readers: the panel gives the lines as text.
 */
export function BingoCard({ card, size }: { card: Pick<BingoWinner, "lines" | "cells" | "marked">; size: "mini" | "full" }) {
  const inLine = new Set(card.lines.flatMap(lineCells));
  const crossed = (i: number) => i !== FREE_CELL && (card.marked & (1 << i)) !== 0;
  const cells = Array.from({ length: 25 }, (_, i) => i).filter((i) => i !== FREE_CELL);

  if (size === "mini")
    return (
      <div className="relative aspect-[3/4] w-[58px] shrink-0" aria-hidden>
        <Image src="/illustrations/bingo/card-front.png" alt="" fill sizes="58px" className="object-contain" />
        {cells
          .filter((i) => inLine.has(i) || crossed(i))
          .map((i) => (
            <span key={i} style={cellBox(i)} className={`absolute rounded-[12%] ${inLine.has(i) ? "bg-accent" : "bg-brand-red"}`} />
          ))}
      </div>
    );

  return (
    <div className="@container relative aspect-[3/4] w-full" aria-hidden>
      <Image src="/illustrations/bingo/card-front.png" alt="" fill sizes="(max-width: 640px) 90vw, 440px" className="object-contain" />
      {cells.map((i) => (
        // The texts scale with the card, like the game's layout prints them on it.
        <span
          key={i}
          style={{ ...cellBox(i), fontSize: "2.35cqw", lineHeight: 1.15 }}
          className="absolute flex items-center justify-center overflow-hidden p-[0.6cqw] text-center font-medium text-black hyphens-auto"
          lang="ru"
        >
          {card.cells[i]}
        </span>
      ))}
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full">
        <g stroke="var(--ts-color-brand-red)" strokeWidth={14} strokeLinecap="round" opacity={0.75}>
          {cells.filter(crossed).map((i) => {
            const [x0, x1] = col(i);
            const [y0, y1] = row(i);
            const m = 38;
            return (
              <g key={i}>
                <line x1={x0 + m} y1={y0 + m} x2={x1 - m} y2={y1 - m} />
                <line x1={x1 - m} y1={y0 + m} x2={x0 + m} y2={y1 - m} />
              </g>
            );
          })}
        </g>
        <g stroke="var(--ts-color-text-accent)" strokeWidth={84} strokeLinecap="round" opacity={0.7} className="mix-blend-multiply">
          {card.lines.map((l) => (
            <Stroke key={l} line={l} />
          ))}
        </g>
      </svg>
    </div>
  );
}
