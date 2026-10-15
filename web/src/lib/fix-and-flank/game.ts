/** Fix and Flank's place in the hub: its page, its authors and links into the game. Safe for client components. */

export const FNF_HOME = "/games/fix-and-flank";
export const FNF_AUTHORS = ["Galaxy", "VonScheer"];
/** A still of mission 1, Trench Line. */
export const FNF_COVER = "/fix-and-flank/cover.jpg";

export const mapPageUrl = (id: string) => `${FNF_HOME}/maps/${encodeURIComponent(id)}`;
export const mapJsonUrl = (id: string) => `/api/games/fix-and-flank/maps/${encodeURIComponent(id)}`;

/** The game's own pages (served by app/games/fix-and-flank/[...path]). */
export const gameUrl = (page: "play" | "editor" | "preview", params?: Record<string, string>) =>
  `${FNF_HOME}/${page}${params ? `?${new URLSearchParams(params)}` : ""}`;

/** Play a hub map: the game loads it from the hub (?src=). */
export const playUrl = (id: string) => gameUrl("play", { src: mapJsonUrl(id) });
/** The map turning in 3D, for its page. */
export const previewUrl = (id: string) => gameUrl("preview", { src: mapJsonUrl(id) });
