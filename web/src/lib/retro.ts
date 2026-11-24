import type { MonthKey } from "./schedule";

/**
 * The latest monthly retrospective: a deck from the ts-wrapped repo, published at retro.tacticalshift.ru.
 * The games feed shows it as a banner above the calendar. Point this at the new deck each month (the
 * numbers are the deck's cover line); null hides the banner.
 */
export type Retro = { url: string; month: MonthKey; image: string; games: number; hours: number; players: number };

export const RETRO: Retro | null = null;

// Previous banner configuration to reuse for the November retrospective:
// export const RETRO: Retro | null = {
//   url: "https://retro.tacticalshift.ru/october-2026/",
//   month: "2026-10",
//   image: "/retro/october-2026.jpg",
//   games: 14,
//   hours: 29,
//   players: 52,
// };
