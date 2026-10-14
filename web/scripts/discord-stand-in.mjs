// npm run dev:discord            the dev server (next dev) talking to this stand-in instead of Discord
// node scripts/discord-stand-in.mjs --only    just the stand-in
//
// A stand-in for the part of Discord's REST API the hub uses (lib/discord): the announcement post and its edits,
// the thread under it (plan notices, «Комментарии»), and the channel webhook comments are posted through. With it,
// «Анонс в Дискорд», plans and comments work on a dev machine end to end without a bot or a server. State is kept in
// .data/discord-stand-in.json (delete it to start over). Not Discord: no rate limits, no permissions, no gateway.
//
// Dev helpers (not Discord's API):
//   POST /dev/say {thread, user: {id, username, global_name?, avatar?}, content, reply_to?}
//        a member writes in a thread, as if in Discord (watch the page pick it up)
//   POST /dev/archive/<thread>     archive a thread, as Discord does after a quiet week
//   GET  /dev                      the whole state
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = path.join(WEB, ".data", "discord-stand-in.json");
const PORT = Number(process.env.STAND_IN_PORT ?? 3099);
export const CHANNEL = "1300000000000000100";
export const GUILD = "1300000000000000001";
const BOT = { id: "1300000000000000002", username: "TS Hub Bot", global_name: null, avatar: null, bot: true };

/** @type {{ messages: Record<string, any[]>, threads: Record<string, {id: string, parent_id: string, name: string, archived: boolean}>, webhooks: any[], seq: number }} */
const state = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
  : { messages: {}, threads: {}, webhooks: [], seq: 0 };
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

/** A snowflake for `ms`: Discord ids sort by time, and the hub relies on that. */
export function snowflake(ms = Date.now(), seq = 0) {
  return ((BigInt(ms) - 1420070400000n) << 22n | BigInt(seq % 4096)).toString();
}
const newId = () => snowflake(Date.now(), ++state.seq);

class Fail extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const unknownChannel = () => new Fail(404, 10003, "Unknown Channel");

function message(channelId, author, body, extra = {}) {
  return {
    id: newId(),
    type: 0,
    channel_id: channelId,
    author,
    content: body.content ?? "",
    embeds: body.embeds ?? [],
    components: body.components ?? [],
    attachments: body.attachments ?? [],
    mentions: [],
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    ...extra,
  };
}

/** Where messages to `id` go: the announce channel, or a thread (a missing thread is Unknown Channel). */
function target(id, { writing }) {
  if (id === CHANNEL) return id;
  const thread = state.threads[id];
  if (!thread) throw unknownChannel();
  if (writing && thread.archived) throw new Fail(400, 50083, "Thread is archived");
  return id;
}

function withReferences(list) {
  return list.map((m) => {
    if (!m.message_reference) return m;
    const ref = (state.messages[m.channel_id] ?? []).find((x) => x.id === m.message_reference.message_id) ?? null;
    return { ...m, referenced_message: ref };
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  if (!buf.length) return {};
  const type = req.headers["content-type"] ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await new Request("http://x", { method: "POST", headers: { "content-type": type }, body: buf }).formData();
    const body = JSON.parse(String(form.get("payload_json") ?? "{}"));
    body.attachments = [...form.entries()]
      .filter(([k]) => k.startsWith("files["))
      .map(([, f], i) => ({ id: String(i), filename: f.name, url: `http://127.0.0.1:${PORT}/files/${f.name}`, content_type: f.type, size: f.size }));
    return body;
  }
  return JSON.parse(buf.toString("utf8"));
}

async function route(method, url, body) {
  const p = url.pathname.replace(/^\/api\/v\d+/, "").split("/").filter(Boolean);
  const is = (m, ...parts) => method === m && p.length === parts.length && parts.every((x, i) => x === "*" || x === p[i]);

  // ------------------------------------------------------------------ dev helpers
  if (is("GET", "dev")) return state;
  if (is("POST", "dev", "say")) {
    target(body.thread, { writing: false });
    const thread = state.threads[body.thread];
    if (thread) thread.archived = false;
    const user = { global_name: null, avatar: null, ...body.user };
    const m = message(body.thread, user, { content: body.content });
    if (body.reply_to) Object.assign(m, { type: 19, message_reference: { message_id: body.reply_to } });
    (state.messages[body.thread] ??= []).push(m);
    return m;
  }
  if (is("POST", "dev", "archive", "*")) {
    if (!state.threads[p[2]]) throw unknownChannel();
    state.threads[p[2]].archived = true;
    return state.threads[p[2]];
  }

  // ------------------------------------------------------------------ messages
  if (is("GET", "channels", "*", "messages")) {
    const ch = target(p[1], { writing: false });
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));
    return withReferences([...(state.messages[ch] ?? [])].reverse().slice(0, limit));
  }
  if (is("POST", "channels", "*", "messages")) {
    const ch = target(p[1], { writing: true });
    const m = message(ch, BOT, body);
    (state.messages[ch] ??= []).push(m);
    return m;
  }
  if (is("PATCH", "channels", "*", "messages", "*")) {
    const m = (state.messages[p[1]] ?? []).find((x) => x.id === p[3]);
    if (!m) throw new Fail(404, 10008, "Unknown Message");
    for (const k of ["content", "embeds", "components"]) if (k in body) m[k] = body[k];
    m.edited_timestamp = new Date().toISOString();
    return m;
  }

  // ------------------------------------------------------------------ threads
  if (is("POST", "channels", "*", "messages", "*", "threads")) {
    if (!(state.messages[p[1]] ?? []).some((x) => x.id === p[3])) throw new Fail(404, 10008, "Unknown Message");
    if (state.threads[p[3]]) throw new Fail(400, 160004, "A thread has already been created for this message");
    state.threads[p[3]] = { id: p[3], parent_id: p[1], name: body.name, archived: false };
    return { id: p[3], type: 10, parent_id: p[1], name: body.name };
  }
  if (is("PATCH", "channels", "*")) {
    const thread = state.threads[p[1]];
    if (!thread) throw unknownChannel();
    if ("archived" in body) thread.archived = !!body.archived;
    return thread;
  }

  // ------------------------------------------------------------------ webhooks
  if (is("GET", "channels", "*", "webhooks")) return state.webhooks.filter((w) => w.channel_id === p[1]);
  if (is("POST", "channels", "*", "webhooks")) {
    if (p[1] !== CHANNEL) throw unknownChannel();
    const hook = { id: newId(), type: 1, channel_id: p[1], name: body.name, token: `tok-${Math.random().toString(36).slice(2)}` };
    state.webhooks.push(hook);
    return hook;
  }
  if (is("POST", "webhooks", "*", "*")) {
    const hook = state.webhooks.find((w) => w.id === p[1] && w.token === p[2]);
    if (!hook) throw new Fail(404, 10015, "Unknown Webhook");
    const username = body.username ?? hook.name;
    if (/discord|clyde/i.test(username)) throw new Fail(400, 50035, "Invalid Form Body: username");
    const threadId = url.searchParams.get("thread_id");
    let ch = hook.channel_id;
    if (threadId) {
      const thread = state.threads[threadId];
      if (!thread || thread.parent_id !== hook.channel_id) throw unknownChannel();
      thread.archived = false; // a webhook post reopens an archived thread
      ch = threadId;
    }
    const m = message(ch, { id: hook.id, username, global_name: null, avatar: null, bot: true }, body, { webhook_id: hook.id });
    (state.messages[ch] ??= []).push(m);
    return url.searchParams.get("wait") === "true" ? m : null;
  }
  throw new Fail(404, 0, `stand-in: no route for ${method} ${url.pathname}`);
}

function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    let status = 200;
    let out;
    try {
      out = await route(req.method ?? "GET", url, await readBody(req));
      if (req.method !== "GET") save();
      if (out === null) status = 204;
    } catch (err) {
      status = err instanceof Fail ? err.status : 500;
      out = { message: err.message, code: err.code ?? 0 };
    }
    console.log(`[discord stand-in] ${req.method} ${url.pathname}${url.search} → ${status}`);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(status === 204 ? undefined : JSON.stringify(out));
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`[discord stand-in] http://127.0.0.1:${PORT}/api/v10 (channel ${CHANNEL})`));
  return server;
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) {
  serve();
  if (!process.argv.includes("--only")) {
    // next dev with the hub's Discord pointed here. Variables already set win over .env files.
    const next = spawn(process.execPath, [path.join(WEB, "node_modules", "next", "dist", "bin", "next"), "dev", ...process.argv.slice(2)], {
      cwd: WEB,
      stdio: "inherit",
      env: {
        ...process.env,
        DISCORD_API_URL: `http://127.0.0.1:${PORT}/api/v10`,
        DISCORD_BOT_TOKEN: "stand-in",
        DISCORD_ANNOUNCE_CHANNEL_ID: CHANNEL,
        DISCORD_GUILD_ID: GUILD,
      },
    });
    next.on("exit", (code) => process.exit(code ?? 0));
    for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => next.kill(sig));
  }
}
