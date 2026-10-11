"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { shortDate } from "@/lib/format";
import { makeT, plural, type Locale } from "@/lib/i18n";
import { linkPlayerNames, unlinkPlayerName } from "@/lib/roster/actions";
import type { InGameName } from "@/lib/roster/links";
import { isSure, type MemberLite, type Suggestion } from "@/lib/roster/match";
import { TextInput } from "../mission/editor/fields";
import { buttonClass } from "../ui";

type Filter = "todo" | "linked" | "all";

const GHOST = "h-8 rounded-md px-2.5 type-label-s text-fg-secondary hover:bg-raised hover:text-fg disabled:opacity-50";

/** How a member reads in the picker: the nickname, and the username when it differs (nicknames can repeat). */
const memberLabel = (m: MemberLite) => (m.username && m.username !== m.name ? `${m.name} (@${m.username})` : m.name);

function Avatar({ m }: { m: MemberLite }) {
  const [broken, setBroken] = useState(false);
  // next.config allows Discord's custom avatars only; default ones, and pictures changed since the member list was
  // read (the stored link then 404s), get the initial.
  if (!broken && m.avatar?.startsWith("https://cdn.discordapp.com/avatars/")) {
    return <Image src={m.avatar} alt="" width={24} height={24} onError={() => setBroken(true)} className="size-6 shrink-0 rounded-full" />;
  }
  return (
    <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-raised type-caption-strong text-fg-secondary">
      {(m.name.replace(/\[[^\]]*\]/g, "").match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * The admin page «Игроки»: every in-game name from played games, matched by hand to a Discord member. Unmatched
 * names come first with a suggestion (lib/roster/match.ts) to accept in one click; «Другой…» picks any member.
 */
export function PlayerLinks({ names, members, locale }: { names: InGameName[]; members: MemberLite[]; locale: Locale }) {
  const t = makeT(locale);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<Filter>("todo");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const linked = names.filter((n) => n.memberId).length;
  const sure = names.filter((n) => !n.memberId && isSure(n.suggestion));

  const q = query.trim().toLowerCase();
  const shown = names.filter((n) => {
    if (filter === "todo" && n.memberId) return false;
    if (filter === "linked" && !n.memberId) return false;
    if (!q) return true;
    const member = n.memberId ? byId.get(n.memberId) : undefined;
    return n.name.toLowerCase().includes(q) || !!member?.name.toLowerCase().includes(q);
  });

  const run = (job: () => Promise<unknown>) => {
    setError(null);
    start(async () => {
      const r = (await job()) as { error?: string } | null;
      if (r?.error) setError(t("players.error"));
      else {
        setPicking(null);
        setPick("");
        router.refresh();
      }
    });
  };
  const link = (pairs: { name: string; memberId: string }[]) => run(() => linkPlayerNames(pairs));

  const choose = (name: string) => {
    const typed = pick.trim();
    const exact = members.find((m) => memberLabel(m) === typed);
    const byName = members.filter((m) => m.name.toLowerCase() === typed.toLowerCase());
    const m = exact ?? (byName.length === 1 ? byName[0] : undefined);
    if (!m) return setError(t("players.noMember"));
    link([{ name, memberId: m.id }]);
  };

  const reason = (s: Suggestion) =>
    `${s.reason === "account" ? t("players.reason.account", { name: s.via ?? "" }) : t(`players.reason.${s.reason}`)}${
      s.others ? ` · ${t("players.reason.others", { n: s.others })}` : ""
    }`;

  const tabs: Filter[] = ["todo", "linked", "all"];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" className="flex gap-1 rounded-lg bg-inset p-1">
          {tabs.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`h-9 rounded-md px-3 type-label-s ${filter === f ? "bg-raised text-fg" : "text-fg-secondary hover:text-fg"}`}
            >
              {t(`players.filter.${f}`)}
            </button>
          ))}
        </div>
        <TextInput
          dense
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("players.search")}
          aria-label={t("players.search")}
          className="w-56 max-w-full"
        />
        <span className="type-body-s text-fg-secondary">{t("players.progress", { linked, total: names.length })}</span>
        {sure.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(plural(locale, "players.bulkConfirm", sure.length))) return;
              link(sure.map((n) => ({ name: n.name, memberId: n.suggestion!.memberId })));
            }}
            className={`${buttonClass("primary", "s")} ml-auto disabled:opacity-60`}
          >
            {plural(locale, "players.bulk", sure.length)}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="type-body-s text-fg-danger">
          {error}
        </p>
      )}

      <datalist id="roster-members">
        {members.map((m) => (
          <option key={m.id} value={memberLabel(m)} />
        ))}
      </datalist>

      {shown.length === 0 ? (
        <p className="rounded-xl bg-surface px-5 py-8 text-center type-body-m text-fg-secondary">
          {q ? t("players.empty.search") : filter === "todo" ? t("players.empty.todo") : t("players.empty.search")}
        </p>
      ) : (
        <ul className="flex flex-col rounded-xl bg-surface">
          {shown.map((n) => {
            const member = n.memberId ? byId.get(n.memberId) : undefined;
            const suggested = n.suggestion ? byId.get(n.suggestion.memberId) : undefined;
            return (
              <li key={n.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3 first:border-t-0">
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                  <span className="truncate type-label-m text-fg">{n.name}</span>
                  <span className="type-caption text-fg-tertiary">
                    {plural(locale, "players.games", n.games)} · {t("players.last", { date: shortDate(n.lastPlayed) })}
                    {n.hasAccount && <span title={t("players.accountHint")}> · {t("players.account")}</span>}
                  </span>
                </div>

                {picking === n.name ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <TextInput
                      dense
                      autoFocus
                      list="roster-members"
                      value={pick}
                      onChange={(e) => setPick(e.target.value)}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          choose(n.name);
                        } else if (e.key === "Escape") setPicking(null);
                      }}
                      placeholder={t("players.memberPh")}
                      aria-label={t("players.memberPh")}
                      className="w-64 max-w-full"
                    />
                    <button type="button" disabled={pending || !pick.trim()} onClick={() => choose(n.name)} className={`${buttonClass("secondary", "s")} disabled:opacity-60`}>
                      {t("players.link")}
                    </button>
                    <button type="button" onClick={() => setPicking(null)} className={GHOST}>
                      {t("players.cancel")}
                    </button>
                  </div>
                ) : member ? (
                  <div className="flex items-center gap-3">
                    <span className="flex min-w-0 items-center gap-2 type-label-s text-fg">
                      <Avatar m={member} />
                      <span className="truncate">{member.name}</span>
                    </span>
                    <button type="button" disabled={pending} onClick={() => run(() => unlinkPlayerName(n.name))} className={GHOST}>
                      {t("players.unlink")}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {suggested && n.suggestion && (
                      <div className="flex flex-col items-end gap-0.5">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => link([{ name: n.name, memberId: suggested.id }])}
                          className={`${buttonClass("secondary", "s")} disabled:opacity-60`}
                        >
                          <Avatar m={suggested} />
                          {t("players.linkTo", { name: suggested.name })}
                        </button>
                        <span className="type-caption text-fg-tertiary">{reason(n.suggestion)}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPicking(n.name);
                        setPick("");
                        setError(null);
                      }}
                      className={GHOST}
                    >
                      {suggested ? t("players.other") : t("players.choose")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
