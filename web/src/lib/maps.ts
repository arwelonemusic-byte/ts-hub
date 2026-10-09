/** Planner maps (ts-ops-planner web/src/lib/maps.ts): a mission's terrain is one of these keys. */
export const MAPS: readonly { key: string; label: string }[] = [
  { key: "arland", label: "Arland" },
  { key: "everon", label: "Everon" },
  { key: "kolguyev", label: "Kolguyev" },
  { key: "zarichne", label: "Zarichne" },
  { key: "zargabad", label: "Zargabad" },
  { key: "zimnitrita", label: "Zimnitrita" },
  { key: "serhiivka", label: "Serhiivka" },
  { key: "takistan", label: "Takistan" },
  { key: "ruha", label: "Ruha" },
  { key: "anizay", label: "Anizay" },
  { key: "chernarus", label: "Chernarus" },
  { key: "faircroft", label: "Faircroft Islands" },
  { key: "armenhof", label: "Armenhof" },
  { key: "alhadra", label: "Al Hadra" },
  { key: "seitenbuch", label: "Seitenbuch" },
  { key: "iraq1990", label: "Iraq 1990" },
  { key: "kunar", label: "Kunar Province" },
  { key: "merak", label: "Merak" },
  { key: "mogadishu", label: "Mogadishu" },
  { key: "novka", label: "Novka" },
  { key: "westzagoria", label: "West Zagoria" },
];

export const mapLabel = (key: string) => MAPS.find((m) => m.key === key)?.label ?? null;

/**
 * Terrain addons by Workshop GUID, from the catalogue's dependencies (2026-10-09). One addon can
 * hold several maps (Takistan ships Zargabad too), so a GUID maps to every map it may be.
 * Everon, Arland and Kolguyev come with the game: a mission on them has no terrain dependency.
 */
const TERRAIN_ADDONS: Record<string, string[]> = {
  "665D1AA55B5D8076": ["chernarus"], // Chernarus Minus
  "656514EAA451A2B2": ["armenhof"],
  "68957914EA45BA6C": ["alhadra"], // AL Hadra
  "5F031E702D6FAAB1": ["seitenbuch"], // Seitenbuch - Germany
  "614B62005CBB8057": ["faircroft"], // Faircroft Islands
  "61557578724DBE60": ["serhiivka"], // WCS_Serhiivka
  "5C9691EA7FD7A79F": ["kunar"], // KunarProvince
  "615EEBD9BDFEEE9B": ["takistan", "zargabad"], // Takistan
  "6047000574D60BF9": ["merak"], // Merak Island
  "6044F5AB4E6F9D5A": ["westzagoria"],
  "5F1D02080409E128": ["mogadishu"],
  "653CB36244ADBE0F": ["ruha"],
  "61A56756149009FF": ["iraq1990"],
  "61732D4F7D980E9A": ["zarichne"],
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Addon names that don't squash to a map label. */
const NAME_ALIASES: Record<string, string> = {
  chernarusminus: "chernarus",
  wcsserhiivka: "serhiivka",
  merakisland: "merak",
  kunarprovince: "kunar",
  seitenbuchgermany: "seitenbuch",
  faircroftislands: "faircroft",
};

/** The maps a Workshop dependency list points at: by known terrain GUID, else by addon name. */
export function terrainCandidates(deps: { id: string; name: string }[]): string[] {
  const out = new Set<string>();
  for (const d of deps) {
    for (const key of TERRAIN_ADDONS[d.id.toUpperCase()] ?? []) out.add(key);
    const n = squash(d.name);
    const byName = NAME_ALIASES[n] ?? MAPS.find((m) => squash(m.label) === n || m.key === n)?.key;
    if (byName) out.add(byName);
  }
  return [...out];
}
