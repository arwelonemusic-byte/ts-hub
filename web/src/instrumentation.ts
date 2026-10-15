/** Runs once when the server starts (Next.js instrumentation). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { resyncAnnouncements } = await import("./lib/discord/post");
  // Not awaited: the server shouldn't wait on the database or Discord to start.
  setTimeout(() => resyncAnnouncements().catch((err) => console.error("[discord] resync after start failed:", err)), 5000);
  const { fillLosses } = await import("./lib/fix-and-flank/runs");
  setTimeout(() => fillLosses().catch((err) => console.error("[fix-and-flank] filling in runs' losses failed:", err)), 5000);
}
