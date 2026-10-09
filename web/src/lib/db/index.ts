import { migrate, openDb, seed, type Db } from "../../../scripts/db-core.mjs";

export type { Db };

/**
 * One connection pool per server process (kept on globalThis so dev reloads reuse it).
 * Production migrates in the deploy script; the dev database (PGlite) sets itself up here:
 * migrations, then the seed (catalogue, games, member list) while it has no missions or no games.
 */
const g = globalThis as unknown as { __tsHubDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const db = await openDb();
  if (!process.env.DATABASE_URL) {
    await migrate(db);
    const [{ missions, events }] = await db.query(
      "SELECT (SELECT count(*)::int FROM missions) AS missions, (SELECT count(*)::int FROM events) AS events",
    );
    if (missions === 0 || events === 0) await seed(db);
  }
  return db;
}

export function getDb(): Promise<Db> {
  g.__tsHubDb ??= connect().catch((err) => {
    g.__tsHubDb = undefined;
    throw err;
  });
  return g.__tsHubDb;
}
