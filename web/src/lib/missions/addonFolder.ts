/*
 * «Заполнить из папки аддона»: the author picks the mission's addon folder (their Workbench project,
 * or an unpacked Workshop addon) and the browser reads the briefing and the Markers.layer out of it.
 * Nothing is uploaded: only the parsed text goes into the dialog. Browser-only (File API).
 */

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

/** The world a scenario header loads: `World "{GUID}Worlds/TS_Mission.ent"` → "worlds/ts_mission". */
function scenarioWorld(conf: string): string | null {
  const m = conf.match(/\bWorld\s+"(?:\{[0-9A-Fa-f]{16}\})?([^"]+)\.ent"/);
  return m ? m[1].toLowerCase() : null;
}

/** A file's path inside the picked folder, lower-cased: "MyAddon/Missions/X.conf" → "missions/x.conf". */
const inside = (f: File) => f.webkitRelativePath.split("/").slice(1).join("/").toLowerCase();

const MAX_CONF = 512 * 1024;
const MAX_CONFS = 400;

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

  return {
    root,
    scenarioFound: !!scenarioFile,
    briefing,
    layer: layerFile ? { path: layerFile.webkitRelativePath, text: await layerFile.text() } : null,
    layerCandidates: layerFile ? 1 : layers.length,
  };
}
