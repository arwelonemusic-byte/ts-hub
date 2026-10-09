// npm run db:migrate            apply pending db/migrations
// npm run db:seed [-- --update] [-- --players <file>]
//                               load the catalogue (+ players, if the member list is present);
//                               --update overwrites missions already in the database.
// Production reads DATABASE_URL (deploy: `set -a; . /etc/ts-hub.env`). In dev the server
// migrates and seeds its PGlite database by itself; run this only with the dev server stopped,
// since PGlite allows one process at a time.
import { MEMBERS_FILE, migrate, openDb, seed } from "./db-core.mjs";

const [cmd, ...args] = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const db = await openDb();
try {
  if (cmd === "migrate") {
    const applied = await migrate(db);
    console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
  } else if (cmd === "seed") {
    await migrate(db);
    const n = await seed(db, { update: flag("--update"), players: value("--players") ?? MEMBERS_FILE });
    console.log(`seeded ${n.missions} missions, ${n.players} players`);
  } else {
    console.error("usage: node scripts/db.mjs migrate | seed [--update] [--players <file>]");
    process.exitCode = 2;
  }
} finally {
  await db.close();
}
