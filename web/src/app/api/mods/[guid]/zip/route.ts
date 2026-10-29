import { makeT } from "@/lib/i18n";
import { GUID_RE } from "@/lib/missions/draft";
import { acquireArchive, archivePlan, releaseArchive, STREAM_BYTES_PER_SEC } from "@/lib/mods/jobs";
import { zipStream } from "@/lib/mods/zip";
import { getViewer } from "@/lib/viewer";

const t = makeT("ru"); // a refusal opens as a page of plain text in the member's browser

const refuse = (key: string, status: number, headers: Record<string, string> = {}) =>
  new Response(t(key), { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...headers } });

/**
 * The mod and its dependencies as one zip, to unpack into Documents\My Games\ArmaReforger\addons
 * (`?skip=GUID,GUID`: dependencies the member already has). Served from the box's copy as it is now, so the dialog
 * gets it ready first («Скачать мод»). Members of the Discord only; refused while the box is downloading.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/mods/[guid]/zip">) {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return refuse("mods.zip.members", 403);
  const guid = (await ctx.params).guid.toUpperCase();
  if (!GUID_RE.test(guid)) return refuse("mods.zip.notHere", 404);
  const skip = new Set(
    (new URL(req.url).searchParams.get("skip") ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => GUID_RE.test(s)),
  );

  const lease = acquireArchive();
  if (lease !== true) return refuse(lease === "updating" ? "mods.busy.updating" : "mods.busy.full", 503, { "Retry-After": "60" });
  let handedOver = false;
  try {
    const plan = await archivePlan(guid, skip);
    if (!plan) return refuse("mods.zip.notHere", 404);
    const main = plan.addons[0];
    const file = `${main.name}${main.version ? `_${main.version}` : ""}.zip`;
    const { length, body } = zipStream(plan.entries, { bytesPerSec: STREAM_BYTES_PER_SEC, onClose: releaseArchive });
    handedOver = true;
    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(length),
        "Content-Disposition": `attachment; filename="${file.replace(/[^\w.-]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file)}`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    if (!handedOver) releaseArchive();
  }
}
