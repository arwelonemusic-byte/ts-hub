import { getServerUp } from "@/lib/server-status";
import { getViewer } from "@/lib/viewer";

/** Is the game server up, for the pill in the corner (components/ServerStatus.tsx). Members of the Discord only. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.inGuild) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ up: await getServerUp() }, { headers: { "Cache-Control": "no-store" } });
}
