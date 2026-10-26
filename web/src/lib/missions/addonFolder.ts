/*
 * «Заполнить из папки аддона»: the author picks the mission's addon folder (their Workbench project,
 * or an unpacked Workshop addon) and the browser reads the briefing, the Markers.layer and the squads
 * out of it. Nothing is uploaded: only the parsed text goes into the dialog. Browser-only (File API).
 */

import type { MissionSquad } from "../types";

export interface ImportedSection {
  title: string;
  body: string;
}

export interface FolderImport {
  /** The folder the author picked. */
  root: string;
  /** The scenario's .conf was in the folder (else it may be the wrong one). */
  scenarioFound: boolean;
  /** From the journal config (SCR_JournalSetupConfig); null = none found. */
  briefing: { path: string; sections: ImportedSection[] } | null;
  /** The scenario world's Markers.layer; null = none found, or several and no scenario to tell them apart. */
  layer: { path: string; text: string } | null;
  /** Markers.layer files found when none could be picked. */
  layerCandidates: number;
  /** The squads with seats in the scenario's world (parseSquads), required roles left to the author; null = none found. */
  squads: { path: string; squads: MissionSquad[] } | null;
  /** Worlds with seated squads found when none could be picked. */
  squadWorlds: number;
}

/** Built-in journal entry types (SCR_EJournalEntryType); a missing field means Situation. */
const ENTRY_TITLES: Record<string, string> = {
  Situation: "Ситуация",
  Mission: "Задачи",
  Execution: "Выполнение",
  Signal: "Связь",
  Intel: "Разведка",
};

const STRING = /"((?:[^"\\]|\\.)*)"/;
const unescape = (s: string) => s.replace(/\\(["\\])/g, "$1").replace(/\\n/g, "\n").replace(/\\t/g, "\t");

/** `m_sEntryText "line one"\` + newline + `"line two"`: Workbench writes multi-line strings as joined pieces. */
function readText(block: string, field: string): string | null {
  const m = block.match(new RegExp(`${field}\\s+((?:"(?:[^"\\\\]|\\\\.)*"\\s*\\\\?\\s*)+)`));
  if (!m) return null;
  const parts = [...m[1].matchAll(new RegExp(STRING, "g"))].map((p) => unescape(p[1]));
  return parts.join("\n");
}

/** The briefing sections of a journal config (the first faction's journal that has entries). */
export function parseJournal(text: string): ImportedSection[] {
  for (const journal of text.split(/\bSCR_JournalConfig\b/).slice(1)) {
    const sections: ImportedSection[] = [];
    for (const block of journal.split(/\bSCR_JournalEntry\b/).slice(1)) {
      const type = block.match(/m_eJournalEntryType\s+(\w+)/)?.[1] ?? "Situation";
      const title = (type === "Custom" ? (readText(block, "m_sCustomEntryName") ?? "Custom") : (ENTRY_TITLES[type] ?? type)).trim().replace(/:$/, "");
      let body = (readText(block, "m_sEntryText") ?? "").trim();
      // Some authors repeat the heading as the text's first line ("Ситуация:").
      const [first, ...rest] = body.split("\n");
      if (first.trim().replace(/:$/, "").toLowerCase() === title.toLowerCase()) body = rest.join("\n").trim();
      // An entry left empty in Workbench isn't a section.
      if (body) sections.push({ title, body });
    }
    if (sections.length) return sections;
  }
  return [];
}

interface Block {
  /** What stands before the brace on its line: `SCR_GroupPreset "{6ADB9850A66BC123}"`. */
  head: string;
  body: string;
}

/**
 * The blocks directly inside `text`, and its own text with them left out. Quoted strings are skipped,
 * since GUIDs and prefab refs carry braces.
 */
function split(text: string): { own: string; blocks: Block[] } {
  const blocks: Block[] = [];
  let own = "";
  let depth = 0;
  let open = 0;
  let head = "";
  for (let i = 0; i < text.length; i++) {
    const start = i;
    if (text[i] === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
    } else if (text[i] === "{") {
      if (depth++ === 0) {
        const nl = own.lastIndexOf("\n");
        head = own.slice(nl + 1).trim();
        own = own.slice(0, nl + 1);
        open = i + 1;
      }
      continue;
    } else if (text[i] === "}") {
      if (depth > 0 && --depth === 0) blocks.push({ head, body: text.slice(open, i) });
      continue;
    }
    if (depth === 0) own += text.slice(start, i + 1);
  }
  return { own, blocks };
}

const child = (blocks: Block[], name: string) => blocks.find((b) => b.head === name || b.head.startsWith(`${name} `));

/** Every faction (a block holding m_aPredefinedGroups) in a world file, in order. */
function factions(text: string): Block[][] {
  return split(text).blocks.flatMap((b) => {
    const inner = split(b.body).blocks;
    return child(inner, "m_aPredefinedGroups") ? [inner] : factions(b.body);
  });
}

/**
 * The squads with seats of a world file: TS Mission Builder's advanced squads, which the toolkit's slot roster
 * (TS_SlotRoster) turns into deploy-menu seats. Each predefined group of the faction (SCR_GroupPreset) may carry
 * `m_aTS_Slots`, one TS_SlotDef per seat; group N gets the faction's Nth squad callsign (`m_aSquadNames`, handed
 * out in order with m_bIsAssignedRandomly 0). Squads without seats are left out but keep their callsign. The first
 * faction with seats wins (the missions are co-op). No required roles: the mission has none, the author picks them.
 */
export function parseSquads(text: string): MissionSquad[] {
  for (const faction of factions(text)) {
    const callsignInfo = split(child(faction, "m_CallsignInfo")?.body ?? "").blocks;
    const callsigns = split(child(callsignInfo, "m_aSquadNames")?.body ?? "").blocks.map((b) => readText(split(b.body).own, "m_sCallsign")?.trim() ?? "");
    // A disabled preset makes no group, so takes no callsign.
    const presets = split(child(faction, "m_aPredefinedGroups")!.body)
      .blocks.map((b) => split(b.body))
      .filter((p) => !/(?:^|\s)m_bIsEnabled\s+0\b/.test(p.own));
    const squads = presets.flatMap((p, i) => {
      const seats = split(child(p.blocks, "m_aTS_Slots")?.body ?? "").blocks;
      if (!seats.length) return [];
      return [
        {
          groupId: callsigns[i] || `1'${i + 1}`,
          name: readText(p.own, "m_sGroupName")?.trim() ?? "",
          slots: seats.map((s) => ({ role: readText(split(s.body).own, "m_sName")?.trim() ?? "" })),
        },
      ];
    });
    if (squads.length) return squads;
  }
  return [];
}

/** Required roles already picked in the dialog stay on the same slot (same squad callsign and name) of a new import. */
export function keepRequiredRoles(imported: MissionSquad[], current: MissionSquad[]): MissionSquad[] {
  const key = (groupId: string, role: string) => `${groupId.trim().toLowerCase()}\n${role.trim().toLowerCase()}`;
  const picked = new Map<string, string[]>();
  for (const sq of current)
    for (const s of sq.slots) if (s.requiredRole) picked.set(key(sq.groupId, s.role), [...(picked.get(key(sq.groupId, s.role)) ?? []), s.requiredRole]);
  return imported.map((sq) => ({
    ...sq,
    slots: sq.slots.map((s) => {
      const requiredRole = picked.get(key(sq.groupId, s.role))?.shift();
      return requiredRole ? { ...s, requiredRole } : s;
    }),
  }));
}

/** The world a scenario header loads: `World "{GUID}Worlds/TS_Mission.ent"` → "worlds/ts_mission". */
function scenarioWorld(conf: string): string | null {
  const m = conf.match(/\bWorld\s+"(?:\{[0-9A-Fa-f]{16}\})?([^"]+)\.ent"/);
  return m ? m[1].toLowerCase() : null;
}

/** A file's path inside the picked folder, lower-cased: "MyAddon/Missions/X.conf" → "missions/x.conf". */
const inside = (f: File) => f.webkitRelativePath.split("/").slice(1).join("/").toLowerCase();

/** The world a world file belongs to: "worlds/x.ent" and "worlds/x_layers/default.layer" → "worlds/x". */
const worldOf = (rel: string) => rel.replace(/(?:_layers\/.+\.layer|\.ent)$/, "");

const MAX_CONF = 512 * 1024;
const MAX_CONFS = 400;
const MAX_WORLD_FILE = 8 * 1024 * 1024;

export async function importAddonFolder(files: File[], scenarioId: string): Promise<FolderImport> {
  const root = files[0]?.webkitRelativePath.split("/")[0] ?? "";
  const byPath = new Map(files.map((f) => [inside(f), f]));
  const find = (rel: string) => byPath.get(rel) ?? [...byPath.entries()].find(([p]) => p.endsWith(`/${rel}`))?.[1];

  // The scenario header names its world; the world's layers sit in "<world>_Layers/".
  const scenarioFile = find(scenarioId.replace(/^\{[0-9A-Fa-f]{16}\}/, "").toLowerCase());
  const world = scenarioFile ? scenarioWorld(await scenarioFile.text()) : null;
  const layers = files.filter((f) => f.name.toLowerCase() === "markers.layer");
  const layerFile = (world && find(`${world}_layers/markers.layer`)) || (layers.length === 1 ? layers[0] : undefined);

  // The journal config: any .conf declaring SCR_JournalSetupConfig, Configs/ first.
  const confs = files
    .filter((f) => f.name.toLowerCase().endsWith(".conf") && f.size <= MAX_CONF)
    .sort((a, b) => Number(!inside(a).startsWith("configs/")) - Number(!inside(b).startsWith("configs/")))
    .slice(0, MAX_CONFS);
  let briefing: FolderImport["briefing"] = null;
  for (const f of confs) {
    const text = await f.text();
    if (!text.includes("SCR_JournalSetupConfig")) continue;
    const sections = parseJournal(text);
    if (sections.length) {
      briefing = { path: f.webkitRelativePath, sections };
      break;
    }
  }

  // The squads sit on the faction manager, in the world itself or one of its layers (default.layer, as the Builder
  // writes it). Without the scenario, any world will do if only one has seats.
  const worldFiles = files.filter((f) => {
    const rel = inside(f);
    if (!/\.(?:ent|layer)$/.test(rel) || f.size > MAX_WORLD_FILE) return false;
    return !world || worldOf(rel) === world || worldOf(rel).endsWith(`/${world}`);
  });
  const seated = new Map<string, { path: string; squads: MissionSquad[] }>();
  for (const f of worldFiles.slice(0, MAX_CONFS)) {
    if (seated.has(worldOf(inside(f)))) continue;
    const text = await f.text();
    if (!text.includes("m_aTS_Slots")) continue;
    const squads = parseSquads(text);
    if (squads.length) seated.set(worldOf(inside(f)), { path: f.webkitRelativePath, squads });
  }

  return {
    root,
    scenarioFound: !!scenarioFile,
    briefing,
    layer: layerFile ? { path: layerFile.webkitRelativePath, text: await layerFile.text() } : null,
    layerCandidates: layerFile ? 1 : layers.length,
    squads: seated.size === 1 ? [...seated.values()][0] : null,
    squadWorlds: seated.size,
  };
}
