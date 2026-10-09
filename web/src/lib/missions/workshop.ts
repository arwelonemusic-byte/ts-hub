import { terrainCandidates } from "../maps";
import { saveUpload } from "../uploads";
import { GUID_RE, missionTitle } from "./draft";

/*
 * The Reforger Workshop has no public API; an addon's page carries its data as Next.js page props
 * (`__NEXT_DATA__`): name, main image, scenarios and the dependency tree. Server-side only.
 */
const WORKSHOP = "https://reforger.armaplatform.com/workshop/";
/** Workshop images come from Bohemia's CDN; nothing else is downloaded. */
const CDN = "ar-gcp-cdn.bistudio.com";
const MAX_COVER = 8 * 1024 * 1024;
const onCdn = (url: string) => {
  try {
    return new URL(url).hostname === CDN;
  } catch {
    return false;
  }
};

/** The addon GUID in a Workshop link ("…/workshop/6A97FA24D9CEAB61-Wolfsnest") or on its own. */
export function workshopGuid(input: string): string | null {
  const m = input.trim().match(/(?:^|\/workshop\/)([0-9A-Fa-f]{16})(?=$|[-/?#\s])/);
  const guid = m?.[1].toUpperCase() ?? null;
  return guid && GUID_RE.test(guid) ? guid : null;
}

export const workshopPage = (guid: string) => `${WORKSHOP}${guid}`;

interface Dep {
  asset: { id: string; name: string };
  dependencies?: Dep[];
}

export interface WorkshopAsset {
  guid: string;
  title: string;
  coverUrl: string | null;
  scenarios: { id: string; name: string }[];
  /** Every dependency, nested ones included. */
  dependencies: { id: string; name: string }[];
  terrain: string[];
}

export async function fetchWorkshopAsset(guid: string): Promise<WorkshopAsset | "notFound" | "unreachable"> {
  let html: string;
  try {
    const res = await fetch(workshopPage(guid), { headers: { "User-Agent": "Mozilla/5.0 (TS Hub)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (res.status === 404) return "notFound";
    if (!res.ok) return "unreachable";
    html = await res.text();
  } catch {
    return "unreachable";
  }
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  let asset: {
    id?: string;
    name?: string;
    previews?: { url?: string }[];
    scenarios?: { gameId?: string; name?: string }[];
    dependencies?: Dep[];
  } | null = null;
  try {
    asset = raw ? JSON.parse(raw)?.props?.pageProps?.asset ?? null : null;
  } catch {
    asset = null;
  }
  if (!asset?.id || !asset.name) return "notFound";

  const deps = new Map<string, string>();
  const walk = (list?: Dep[]) => {
    for (const d of list ?? []) {
      if (d.asset?.id && !deps.has(d.asset.id)) deps.set(d.asset.id, d.asset.name);
      walk(d.dependencies);
    }
  };
  walk(asset.dependencies);
  const dependencies = [...deps].map(([id, name]) => ({ id, name }));
  const cover = asset.previews?.[0]?.url ?? null;
  return {
    guid: asset.id.toUpperCase(),
    title: missionTitle(asset.name),
    coverUrl: cover && onCdn(cover) ? cover : null,
    scenarios: (asset.scenarios ?? []).filter((s) => s.gameId).map((s) => ({ id: s.gameId!, name: s.name ?? s.gameId! })),
    dependencies,
    terrain: terrainCandidates(dependencies),
  };
}

/** Downloads the addon's Workshop image into the hub's uploads; its URL, or null when there's none or it fails. */
export async function storeWorkshopCover(missionId: string, coverUrl: string | null): Promise<string | null> {
  if (!coverUrl || !onCdn(coverUrl)) return null;
  try {
    const res = await fetch(coverUrl, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : null;
    if (!res.ok || !ext) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_COVER) return null;
    return await saveUpload("covers", missionId, bytes, ext);
  } catch {
    return null;
  }
}
