import Image from "next/image";
import { CommentForm } from "@/components/event/CommentForm";
import { CommentList } from "@/components/event/CommentList";
import { buttonClass, Icon } from "@/components/ui";
import { deleteMapComment, postMapComment } from "@/lib/fix-and-flank/actions";
import { FNF_COMMENT_MAX, gameUrl } from "@/lib/fix-and-flank/game";
import { shortDay, time } from "@/lib/format";
import type { FnfComment, FnfRun } from "@/lib/fix-and-flank/types";
import { format, plural, type Locale, type T } from "@/lib/i18n";
import type { Viewer } from "@/lib/viewer";

const MEDALS = ["gold", "silver", "bronze"];

/**
 * «Рейтинг» (sketch "Map Details"): each player's best win, up to 10, fewest turns first; a tie shares the
 * rank. «Повтор» plays the run back in the game (its seed and orders; the AI plays OPFOR again), for members.
 */
export function LeaderboardPanel({ runs, canWatch, now, locale, t }: { runs: FnfRun[]; canWatch: boolean; now: Date; locale: Locale; t: T }) {
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
              <span className="shrink-0 type-heading-xxs text-fg">
                {plural(locale, "fnf.turns", r.turns)}
                {/* Losses beside the turns (user request 2026-10-15); the ranking is turns only. */}
                {r.losses !== null && (
                  <span className="text-fg-tertiary"> / {r.losses ? plural(locale, "fnf.losses", r.losses) : t("fnf.noLosses")}</span>
                )}
              </span>
              {canWatch ? (
                <a href={gameUrl("play", { replay: r.runId })} className={buttonClass("secondary", "s")}>
                  <Icon name="play-light" />
                  {t("fnf.replay")}
                </a>
              ) : (
                <button type="button" disabled title={t("fnf.replay.members")} className={buttonClass("secondary", "s")}>
                  <Icon name="play-light" />
                  {t("fnf.replay")}
                </button>
              )}
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
 * «Комментарии» on a map: the box to write in on top (the sketch's note), then the comments, newest first. The hub's
 * own (fnf_comments), not a Discord thread like a game's. Members of the Discord write, on a published map; a comment
 * can be taken down by its author or an admin.
 */
export function MapCommentsPanel({
  mapId,
  comments,
  viewer,
  viewerId,
  open,
  now,
  locale,
  t,
}: {
  mapId: string;
  comments: FnfComment[];
  viewer: Viewer | null;
  /** The viewer's players.id: their own comments get «Удалить». */
  viewerId: string | null;
  /** Published: a draft is its author's alone, so nobody comments on it. */
  open: boolean;
  now: Date;
  locale: Locale;
  t: T;
}) {
  const deleteLabels = { delete: t("fnf.comments.delete"), confirm: t("fnf.comments.deleteConfirm") };
  return (
    <section id="comments" className="flex flex-col gap-4 rounded-xl bg-inset p-5">
      <h2 className="flex items-baseline gap-2 type-heading-xs text-fg">
        {t("fnf.comments")}
        {comments.length > 0 && <span className="type-caption text-fg-tertiary">{comments.length}</span>}
      </h2>
      {!open ? null : viewer?.inGuild && viewerId ? (
        <CommentForm
          action={postMapComment}
          fields={{ map: mapId }}
          me={{ name: viewer.name, avatar: viewer.avatar }}
          max={FNF_COMMENT_MAX}
          labels={{
            placeholder: t("fnf.comments.placeholder"),
            send: t("fnf.comments.send"),
            sending: t("fnf.comments.sending"),
            hint: t("fnf.comments.hint"),
            errors: {
              empty: t("fnf.comments.error.empty"),
              tooLong: format(t("fnf.comments.error.tooLong"), { max: FNF_COMMENT_MAX }),
              forbidden: t("fnf.comments.error.forbidden"),
              gone: t("fnf.comments.error.gone"),
            },
          }}
        />
      ) : viewer ? (
        <p className="type-body-s text-fg-secondary">{t("fnf.comments.members")}</p>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="type-body-s text-fg-secondary">{t("fnf.comments.login")}</p>
          <a href="/api/auth/login" className={buttonClass("secondary", "s")}>
            <Icon name="user-login" />
            {t("auth.login")}
          </a>
        </div>
      )}
      {comments.length ? (
        <CommentList
          comments={comments}
          canDelete={(c) => c.authorId === viewerId || !!viewer?.isAdmin}
          remove={deleteMapComment}
          labels={deleteLabels}
          now={now}
          locale={locale}
        />
      ) : (
        <p className="type-body-s text-fg-secondary">{t("fnf.comments.empty")}</p>
      )}
    </section>
  );
}
