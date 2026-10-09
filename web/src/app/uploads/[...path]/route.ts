import { readFile } from "node:fs/promises";
import { UPLOAD_TYPES, uploadPath } from "@/lib/uploads";

/** Files the hub stored (lib/uploads). Hash-named, so they can be cached for good. */
export async function GET(_req: Request, ctx: RouteContext<"/uploads/[...path]">) {
  const { path: parts } = await ctx.params;
  const file = uploadPath(parts);
  const type = UPLOAD_TYPES[file?.split(".").pop()?.toLowerCase() ?? ""];
  if (!file || !type) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(file);
    return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
