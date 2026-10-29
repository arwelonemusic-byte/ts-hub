import { open, type FileHandle } from "node:fs/promises";

/*
 * A zip archive streamed straight from files on disk: stored, not compressed (paks are compressed already), with
 * every CRC known up front, so the archive's length is known before the first byte and the browser shows a real
 * progress bar. Zip64 where a file, an offset or the directory passes 4 GB (RHS's data.pak is 6 GB). Nothing but
 * node built-ins, so a script can import it on its own.
 */
export interface ZipEntry {
  /** The path inside the archive, forward slashes. */
  name: string;
  /** The file on disk. */
  path: string;
  size: number;
  crc: number;
  mtime: Date;
}

const MAX32 = 0xffffffff;
const CHUNK = 1024 * 1024;
const UTF8 = 0x0800;

function dosDateTime(d: Date): { time: number; date: number } {
  if (d.getFullYear() < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** The zip64 extended information extra field (0x0001) with the given 8-byte values. */
function zip64Extra(values: number[]): Buffer {
  const b = Buffer.alloc(4 + 8 * values.length);
  b.writeUInt16LE(0x0001, 0);
  b.writeUInt16LE(8 * values.length, 2);
  values.forEach((v, i) => b.writeBigUInt64LE(BigInt(v), 4 + 8 * i));
  return b;
}

function localHeader(e: ZipEntry, name: Buffer, big: boolean): Buffer {
  const { time, date } = dosDateTime(e.mtime);
  const extra = big ? zip64Extra([e.size, e.size]) : Buffer.alloc(0);
  const b = Buffer.alloc(30);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(big ? 45 : 20, 4);
  b.writeUInt16LE(UTF8, 6);
  b.writeUInt16LE(0, 8); // stored
  b.writeUInt16LE(time, 10);
  b.writeUInt16LE(date, 12);
  b.writeUInt32LE(e.crc >>> 0, 14);
  b.writeUInt32LE(big ? MAX32 : e.size, 18);
  b.writeUInt32LE(big ? MAX32 : e.size, 22);
  b.writeUInt16LE(name.length, 26);
  b.writeUInt16LE(extra.length, 28);
  return Buffer.concat([b, name, extra]);
}

function centralHeader(e: ZipEntry, name: Buffer, big: boolean, offset: number): Buffer {
  const { time, date } = dosDateTime(e.mtime);
  const farOffset = offset >= MAX32;
  const values = [...(big ? [e.size, e.size] : []), ...(farOffset ? [offset] : [])];
  const extra = values.length ? zip64Extra(values) : Buffer.alloc(0);
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(45, 4);
  b.writeUInt16LE(values.length ? 45 : 20, 6);
  b.writeUInt16LE(UTF8, 8);
  b.writeUInt16LE(0, 10);
  b.writeUInt16LE(time, 12);
  b.writeUInt16LE(date, 14);
  b.writeUInt32LE(e.crc >>> 0, 16);
  b.writeUInt32LE(big ? MAX32 : e.size, 20);
  b.writeUInt32LE(big ? MAX32 : e.size, 24);
  b.writeUInt16LE(name.length, 28);
  b.writeUInt16LE(extra.length, 30);
  // comment length, disk, internal and external attributes: 0
  b.writeUInt32LE(farOffset ? MAX32 : offset, 42);
  return Buffer.concat([b, name, extra]);
}

function endRecords(count: number, cdOffset: number, cdSize: number): Buffer {
  const zip64 = count >= 0xffff || cdOffset >= MAX32 || cdSize >= MAX32;
  const parts: Buffer[] = [];
  if (zip64) {
    const rec = Buffer.alloc(56);
    rec.writeUInt32LE(0x06064b50, 0);
    rec.writeBigUInt64LE(BigInt(44), 4);
    rec.writeUInt16LE(45, 12);
    rec.writeUInt16LE(45, 14);
    rec.writeBigUInt64LE(BigInt(count), 24);
    rec.writeBigUInt64LE(BigInt(count), 32);
    rec.writeBigUInt64LE(BigInt(cdSize), 40);
    rec.writeBigUInt64LE(BigInt(cdOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(rec, locator);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Math.min(count, 0xffff), 8);
  eocd.writeUInt16LE(Math.min(count, 0xffff), 10);
  eocd.writeUInt32LE(cdSize >= MAX32 ? MAX32 : cdSize, 12);
  eocd.writeUInt32LE(cdOffset >= MAX32 ? MAX32 : cdOffset, 16);
  parts.push(eocd);
  return Buffer.concat(parts);
}

/** The archive as a sequence of header buffers and files to copy, and its exact length. */
export function zipLayout(entries: ZipEntry[]): { parts: (Buffer | ZipEntry)[]; length: number } {
  const parts: (Buffer | ZipEntry)[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const big = e.size >= MAX32;
    const local = localHeader(e, name, big);
    central.push(centralHeader(e, name, big, offset));
    parts.push(local, e);
    offset += local.length + e.size;
  }
  const cd = Buffer.concat(central);
  const end = endRecords(entries.length, offset, cd.length);
  parts.push(cd, end);
  return { parts, length: offset + cd.length + end.length };
}

/**
 * The archive as a byte stream, at most `bytesPerSec` (0 = as fast as it goes). `onClose` runs once, when it ends,
 * fails or the client goes away.
 */
export function zipStream(entries: ZipEntry[], opts: { bytesPerSec?: number; onClose?: () => void } = {}): { length: number; body: ReadableStream<Uint8Array> } {
  const { parts, length } = zipLayout(entries);
  const bps = opts.bytesPerSec ?? 0;
  const t0 = Date.now();
  let i = 0;
  let pos = 0;
  let sent = 0;
  let handle: FileHandle | null = null;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await handle?.close().catch(() => {});
    handle = null;
    opts.onClose?.();
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const push = async (buf: Uint8Array) => {
        sent += buf.length;
        const ahead = bps ? (sent / bps) * 1000 - (Date.now() - t0) : 0;
        if (ahead > 0) await new Promise((r) => setTimeout(r, ahead));
        controller.enqueue(buf);
      };
      try {
        while (i < parts.length) {
          const part = parts[i];
          if (Buffer.isBuffer(part)) {
            i++;
            return await push(part);
          }
          if (pos >= part.size) {
            await handle?.close();
            handle = null;
            pos = 0;
            i++;
            continue;
          }
          handle ??= await open(part.path, "r");
          const n = Math.min(CHUNK, part.size - pos);
          const buf = Buffer.allocUnsafe(n);
          const { bytesRead } = await handle.read(buf, 0, n, pos);
          if (bytesRead !== n) throw new Error(`${part.path} got shorter while being sent`);
          pos += n;
          return await push(buf);
        }
        await close();
        controller.close();
      } catch (e) {
        await close();
        controller.error(e);
      }
    },
    async cancel() {
      await close();
    },
  });
  return { length, body };
}
