import Image from "next/image";
import { Avatar } from "@/components/event/Avatar";
import { buttonClass, Icon } from "@/components/ui";
import { shortDay, time } from "@/lib/format";
import type { FnfComment, FnfRun } from "@/lib/fix-and-flank/types";
import { plural, type Locale, type T } from "@/lib/i18n";
import type { Viewer } from "@/lib/viewer";

const MEDALS = ["gold", "silver", "bronze"];

/**
 * «Рейтинг» (sketch "Map Details"): each player's best win, up to 10, fewest turns first; a tie shares the
 * rank. «Повтор» will play the run back (a run is its map, seed and orders); off until runs are recorded.
 */
export function LeaderboardPanel({ runs, now, locale, t }: { runs: FnfRun[]; now: Date; locale: Locale; t: T }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="type-heading-m text-fg">{t("fnf.leaderboard")}</h2>
        <p className="type-body-s text-fg-secondary">{t("fnf.leaderboard.hint")}</p>
      </div>
      {runs.length ? (
        <ol className="flex flex-col">
          {runs.map((r) => (
            <li key={r.runId} className="flex min-h-14 items-center gap-4 border-t border-line py-2">
              <span className="flex w-6 shrink-0 justify-center">
                {r.rank <= MEDALS.length ? (
                  <Image src={`/icons/medal-${MEDALS[r.rank - 1]}.svg`} alt={String(r.rank)} width={20} height={20} />
                ) : (
                  <span className="type-code text-fg-tertiary">{r.rank}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate type-label-m text-fg">{r.player}</span>
                <span className="type-caption text-fg-tertiary">
                  {shortDay(r.finishedAt, now, locale)}, {time(r.finishedAt)}
                </span>
              </span>
              <span className="shrink-0 type-heading-xxs text-fg">{plural(locale, "fnf.turns", r.turns)}</span>
              <button type="button" disabled title={t("fnf.replay.soon")} className={buttonClass("secondary", "s")}>
                <Icon name="play-light" />
                {t("fnf.replay")}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="type-body-m text-fg-secondary">{t("fnf.leaderboard.empty")}</p>
      )}
    </section>
  );
}

/**
 * «Комментарии» on a map: the box to write in on top (the sketch's note), then the comments, newest first.
 * The hub's own (not a Discord thread like a game's). Writing waits for the maps' tables.
 */
export function MapCommentsPanel({ comments, viewer, now, locale, t }: { comments: FnfComment[]; viewer: Viewer | null; now: Date; locale: Locale; t: T }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-inset p-5">
      <h2 className="flex items-baseline gap-2 type-heading-xs text-fg">
        {t("fnf.comments")}
        {comments.length > 0 && <span className="type-caption text-fg-tertiary">{comments.length}</span>}
      </h2>
      {viewer?.inGuild ? (
        <div className="flex gap-3">
          <Avatar name={viewer.name} src={viewer.avatar} size={32} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <textarea
              disabled
              rows={2}
              placeholder={t("fnf.comments.placeholder")}
              className="w-full resize-none rounded-lg border border-line bg-page px-3 py-2 type-body-s text-fg placeholder:text-fg-tertiary disabled:opacity-60"
            />
            <span className="type-caption text-fg-tertiary">{t("fnf.comments.soon")}</span>
          </div>
        </div>
      ) : (
        <p className="type-body-s text-fg-secondary">{t("fnf.comments.login")}</p>
      )}
      {comments.length ? (
        <ol className="flex flex-col">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 border-t border-line py-3">
              <Avatar name={c.author} src={c.avatar} size={32} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex items-baseline gap-2">
                  <span className="type-label-s text-fg">{c.author}</span>
                  <span className="type-caption text-fg-tertiary">
                    {shortDay(c.createdAt, now, locale)}, {time(c.createdAt)}
                  </span>
                </span>
                <p className="whitespace-pre-line type-body-s text-fg-body">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="type-body-s text-fg-secondary">{t("fnf.comments.empty")}</p>
      )}
    </section>
  );
}
