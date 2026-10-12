import dgram from "node:dgram";

/**
 * The game server (the pill in the bottom-right corner, components/ServerStatus.tsx). It runs on the same box as
 * the hub but binds its Steam query (A2S) port to the public address, so it's asked there even from the box: the
 * way the Discord bot checks it. `GAME_SERVER_A2S=host:port` points the check elsewhere (a stand-in in dev).
 */
const IP = "91.206.15.125";
const [A2S_HOST, A2S_PORT] = (process.env.GAME_SERVER_A2S ?? `${IP}:17777`).split(":");

/** How to join, shown to members only. */
export interface ServerInfo {
  name: string;
  /** In the env (GAME_SERVER_PASSWORD), not in this public repo; unset = the card leaves the row out. */
  password: string | null;
  ip: string;
  port: number;
}

export const SERVER_INFO: ServerInfo = {
  name: "[RU] Tactical Shift COOP",
  password: process.env.GAME_SERVER_PASSWORD || null,
  ip: IP,
  port: 2001,
};

/** A2S_INFO; a server that wants a challenge answers 'A' with one, and the request goes again with it appended. */
const INFO_REQUEST = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]), Buffer.from("Source Engine Query\0")]);

/** True when the server answers A2S_INFO ('I') within `timeoutMs`. */
function queryInfo(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const done = (up: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(up);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.on("error", () => done(false));
    socket.on("message", (msg) => {
      if (msg.length < 5 || msg.readInt32LE(0) !== -1) return;
      if (msg[4] === 0x41 && msg.length >= 9) {
        socket.send(Buffer.concat([INFO_REQUEST, msg.subarray(5, 9)]), Number(A2S_PORT), A2S_HOST);
      } else if (msg[4] === 0x49) {
        done(true);
      }
    });
    socket.send(INFO_REQUEST, Number(A2S_PORT), A2S_HOST);
  });
}

const FRESH_MS = 20_000;
type Cached = { at: number; up: boolean };
const cache = ((globalThis as unknown as { __tsHubServerStatus?: { last?: Cached; pending?: Promise<boolean> } }).__tsHubServerStatus ??= {});

/**
 * Is the game server up? Asked at most every 20 s however many pages poll, with a second try before calling
 * it down: one lost UDP packet shouldn't put the server to rest.
 */
export async function getServerUp(): Promise<boolean> {
  if (cache.last && Date.now() - cache.last.at < FRESH_MS) return cache.last.up;
  cache.pending ??= (async () => {
    try {
      const up = (await queryInfo(2000)) || (await queryInfo(2000));
      cache.last = { at: Date.now(), up };
      return up;
    } finally {
      cache.pending = undefined;
    }
  })();
  return cache.pending;
}
