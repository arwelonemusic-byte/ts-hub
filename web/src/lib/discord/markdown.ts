/*
 * Discord's message markdown as a tree, for drawing comments (components/event/DiscordText.tsx). Covers what people
 * type in a thread: **bold**, *italic* / _italic_, __underline__, ~~strike~~, ||spoiler||, `code`, ``` blocks ```,
 * > quotes, # headings, -# small text, lists, links (bare, <url>, [text](url)), mentions, custom emoji and <t:…>
 * timestamps. Anything it doesn't know stays text.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b" | "i" | "u" | "s" | "spoiler"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; url: string; c: Inline[] }
  /** `<@id>`; a role is `<@&id>` (id "&…"). */
  | { t: "mention"; id: string }
  | { t: "channel"; id: string }
  | { t: "emoji"; id: string; name: string; animated: boolean }
  | { t: "time"; unix: number; style: string };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "pre"; lang: string; v: string }
  | { t: "quote"; c: Block[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "small"; c: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: Inline[][] };

type Rule = [RegExp, (m: RegExpExecArray) => Inline];

const RULES: Rule[] = [
  [/^(`+)([\s\S]+?)\1(?!`)/, (m) => ({ t: "code", v: m[2] })],
  [/^\*\*([\s\S]+?)\*\*(?!\*)/, (m) => ({ t: "b", c: inline(m[1]) })],
  [/^__([\s\S]+?)__(?!_)/, (m) => ({ t: "u", c: inline(m[1]) })],
  [/^~~([\s\S]+?)~~/, (m) => ({ t: "s", c: inline(m[1]) })],
  [/^\|\|([\s\S]+?)\|\|/, (m) => ({ t: "spoiler", c: inline(m[1]) })],
  [/^\*(?=\S)([\s\S]*?\S)\*(?!\*)/, (m) => ({ t: "i", c: inline(m[1]) })],
  [/^_(?=\S)([\s\S]*?\S)_(?![_\p{L}\p{N}])/u, (m) => ({ t: "i", c: inline(m[1]) })],
  [/^\[([^\]\n]+)\]\(<?(https?:\/\/[^\s)>]+)>?\)/, (m) => ({ t: "link", url: m[2], c: inline(m[1]) })],
  [/^<(https?:\/\/[^\s>]+)>/, (m) => ({ t: "link", url: m[1], c: [{ t: "text", v: m[1] }] })],
  [/^https?:\/\/[^\s<]*[^\s<.,:;"'!?)\]]/, (m) => ({ t: "link", url: m[0], c: [{ t: "text", v: m[0] }] })],
  [/^<@!?(\d+)>/, (m) => ({ t: "mention", id: m[1] })],
  [/^<@&(\d+)>/, (m) => ({ t: "mention", id: `&${m[1]}` })],
  [/^<#(\d+)>/, (m) => ({ t: "channel", id: m[1] })],
  [/^<(a?):(\w+):(\d+)>/, (m) => ({ t: "emoji", id: m[3], name: m[2], animated: m[1] === "a" })],
  [/^<t:(-?\d+)(?::([tTdDfFR]))?>/, (m) => ({ t: "time", unix: Number(m[1]), style: m[2] ?? "f" })],
];
/** Characters a rule can start with: elsewhere the scan just collects text. */
const STARTS = new Set(["`", "*", "_", "~", "|", "[", "<", "h"]);

export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  let i = 0;
  scan: while (i < s.length) {
    const ch = s[i];
    // A backslash keeps the next markdown character as typed.
    if (ch === "\\" && /[\\*_~`|<>[\]#-]/.test(s[i + 1] ?? "")) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    // _italic_ only starts a word (snake_case stays text).
    if (STARTS.has(ch) && !(ch === "_" && /[\p{L}\p{N}]/u.test(s[i - 1] ?? ""))) {
      const rest = s.slice(i);
      for (const [re, make] of RULES) {
        const m = re.exec(rest);
        if (!m) continue;
        if (text) out.push({ t: "text", v: text });
        text = "";
        out.push(make(m));
        i += m[0].length;
        continue scan;
      }
    }
    text += ch;
    i++;
  }
  if (text) out.push({ t: "text", v: text });
  return out;
}

function lines(src: string): Block[] {
  const out: Block[] = [];
  const rows = src.split("\n");
  let para: string[] = [];
  const flush = () => {
    // Blank lines around a paragraph are spacing, not text.
    while (para.length && !para[0].trim()) para.shift();
    while (para.length && !para[para.length - 1].trim()) para.pop();
    if (para.length) out.push({ t: "p", c: inline(para.join("\n")) });
    para = [];
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let m: RegExpExecArray | null;
    if ((m = /^>>> ?([\s\S]*)$/.exec(row))) {
      flush();
      out.push({ t: "quote", c: lines([m[1], ...rows.slice(i + 1)].join("\n")) });
      return out;
    }
    if (/^> ?/.test(row)) {
      flush();
      const quoted: string[] = [];
      for (; i < rows.length && /^> ?/.test(rows[i]); i++) quoted.push(rows[i].replace(/^> ?/, ""));
      i--;
      out.push({ t: "quote", c: lines(quoted.join("\n")) });
    } else if ((m = /^(#{1,3}) (.+)$/.exec(row))) {
      flush();
      out.push({ t: "h", level: m[1].length as 1 | 2 | 3, c: inline(m[2]) });
    } else if ((m = /^-# (.+)$/.exec(row))) {
      flush();
      out.push({ t: "small", c: inline(m[1]) });
    } else if (/^\s*([-*]|\d+\.) /.test(row)) {
      flush();
      const ordered = /^\s*\d+\./.test(row);
      const start = ordered ? Number(/\d+/.exec(row)![0]) : 1;
      const items: Inline[][] = [];
      for (; i < rows.length && (ordered ? /^\s*\d+\. /.test(rows[i]) : /^\s*[-*] /.test(rows[i])); i++) {
        items.push(inline(rows[i].replace(/^\s*([-*]|\d+\.) /, "")));
      }
      i--;
      out.push({ t: "list", ordered, start, items });
    } else if (!row.trim() && para.length && !para[para.length - 1].trim()) {
      // Two blank lines in a row: one gap is enough.
    } else {
      para.push(row);
    }
  }
  flush();
  return out;
}

/** A message's text as blocks. Code blocks first: nothing inside them is markdown. */
export function parse(src: string): Block[] {
  const out: Block[] = [];
  const text = src.replace(/\r\n?/g, "\n");
  const fence = /```(?:([\w+#.-]+)\n)?\n?([\s\S]*?)\n?```/g;
  let last = 0;
  for (const m of text.matchAll(fence)) {
    out.push(...lines(text.slice(last, m.index)));
    out.push({ t: "pre", lang: m[1] ?? "", v: m[2] });
    last = m.index + m[0].length;
  }
  out.push(...lines(text.slice(last)));
  return out;
}

/** The message is only custom emoji (up to 30, like Discord): they're drawn big. */
export function onlyEmoji(blocks: Block[]): boolean {
  if (blocks.length !== 1 || blocks[0].t !== "p") return false;
  const parts = blocks[0].c.filter((n) => !(n.t === "text" && !n.v.trim()));
  return parts.length > 0 && parts.length <= 30 && parts.every((n) => n.t === "emoji");
}
