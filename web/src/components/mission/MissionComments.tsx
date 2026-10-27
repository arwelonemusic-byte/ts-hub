import { CommentForm } from "@/components/event/CommentForm";
import { CommentList } from "@/components/event/CommentList";
import { buttonClass, Icon } from "@/components/ui";
import type { Locale, T } from "@/lib/i18n";
import { MISSION_COMMENT_MAX } from "@/lib/missions";
import { deleteMissionComment, postMissionComment } from "@/lib/missions/comments";
import type { Mission, MissionComment } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";

/**
 * «Комментарии» on a mission's page (user request 2026-10-27): feedback on the mission itself, bugs and the like, for
 * its authors. The hub's own (mission_comments), never posted to Discord, unlike a game's thread. Everyone reads them;
 * members of the Discord write in the box on top, and the comments follow newest first. A comment by one of the
 * mission's authors says so; its writer or an admin can take it down.
 */
export function MissionComments({
  mission,
  comments,
  viewer,
  now,
  locale,
  t,
}: {
  mission: Pick<Mission, "id" | "authorIds">;
  comments: MissionComment[];
  viewer: Viewer | null;
  now: Date;
  locale: Locale;
  t: T;
}) {
  return (
    <section id="comments" className="flex scroll-mt-24 flex-col gap-4 rounded-xl bg-surface p-6 lg:scroll-mt-[72px]">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-baseline gap-2 type-heading-m text-fg">
          {t("comments.title")}
          {comments.length > 0 && <span className="type-label-m text-fg-tertiary">{comments.length}</span>}
        </h2>
        <p className="type-body-s text-fg-secondary">{t("missionPage.comments.intro")}</p>
      </div>
      {viewer?.inGuild ? (
        <CommentForm
          action={postMissionComment}
          fields={{ mission: mission.id }}
          me={{ name: viewer.name, avatar: viewer.avatar }}
          max={MISSION_COMMENT_MAX}
          labels={{
            placeholder: t("missionPage.comments.placeholder"),
            send: t("comments.send"),
            sending: t("comments.sending"),
            hint: t("missionPage.comments.hint"),
            errors: {
              empty: t("comments.error.empty"),
              tooLong: t("comments.error.tooLong", { max: MISSION_COMMENT_MAX }),
              forbidden: t("missionPage.comments.error.forbidden"),
              gone: t("missionPage.comments.error.gone"),
            },
          }}
        />
      ) : viewer ? (
        <p className="type-body-s text-fg-secondary">{t("missionPage.comments.members")}</p>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="type-body-s text-fg-secondary">{t("missionPage.comments.login")}</p>
          <a href="/api/auth/login" className={buttonClass("secondary", "s")}>
            <Icon name="user-login" />
            {t("auth.login")}
          </a>
        </div>
      )}
      {comments.length ? (
        <CommentList
          comments={comments}
          canDelete={(c) => !!viewer && (viewer.isAdmin || c.discordId === viewer.discordId)}
          tag={(c) => (c.discordId && mission.authorIds.includes(c.discordId) ? t("missionPage.comments.author") : null)}
          remove={deleteMissionComment}
          labels={{ delete: t("missionPage.comments.delete"), confirm: t("missionPage.comments.deleteConfirm") }}
          now={now}
          locale={locale}
        />
      ) : (
        <p className="type-body-s text-fg-secondary">{t("missionPage.comments.empty")}</p>
      )}
    </section>
  );
}
