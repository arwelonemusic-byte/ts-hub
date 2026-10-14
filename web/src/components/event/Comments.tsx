import type { ReactNode } from "react";
import { COMMENT_MAX, type Comment, type Comments } from "@/lib/discord/comments";
import { discordTimestamp, mskDay, shortDay, time } from "@/lib/format";
import { plural, type Locale, type T } from "@/lib/i18n";
import type { Viewer } from "@/lib/viewer";
import { buttonClass, ButtonLink, Icon } from "../ui";
import { Avatar } from "./Avatar";
import { CommentForm } from "./CommentForm";
import { DiscordText, type TextContext } from "./DiscordText";
import { LiveRefresh } from "./LiveRefresh";

/** Messages from one author this close together read as one block, as in Discord. */
const GROUP_MS = 7 * 60_000;
/** The newest blocks shown at once; older ones fold under «Ранние сообщения». */
const SHOWN = 25;

type Group = { notice: boolean; items: Comment[] };

function grouped(comments: Comment[]): Group[] {
  const out: Group[] = [];
  for (const c of comments) {
    const last = out[out.length - 1];
    const prev = last?.items[last.items.length - 1];
    const joins =
      prev && !c.notice && !last.notice && !c.replyTo && prev.author.key === c.author.key && new Date(c.at).getTime() - new Date(prev.at).getTime() < GROUP_MS;
    if (joins) last.items.push(c);
    else out.push({ notice: c.notice, items: [c] });
  }
  return out;
}

/** "сегодня в 19:42", "вчера в 19:42", "12 окт. в 19:42". */
function when(iso: string, now: Date, locale: Locale, t: T): string {
  const day = mskDay(iso);
  if (day === mskDay(now)) return t("comments.today", { time: time(iso) });
  if (day === mskDay(new Date(now.getTime() - 86_400_000))) return t("comments.yesterday", { time: time(iso) });
  return t("comments.on", { day: shortDay(iso, now, locale), time: time(iso) });
}

function Stamp({ iso, cx, t }: { iso: string; cx: TextContext; t: T }) {
  return (
    <time dateTime={iso} title={discordTimestamp(new Date(iso).getTime() / 1000, "F", cx.now, cx.locale)} className="shrink-0 type-caption text-fg-tertiary">
      {when(iso, cx.now, cx.locale, t)}
    </time>
  );
}

/** Attachments (images inline, other files as links), stickers and «(изменено)». */
function Extras({ c, t }: { c: Comment; t: T }) {
  if (!c.attachments.length && !c.stickers.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {c.attachments.map((a) =>
        a.image ? (
          <a key={a.url} href={a.url} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-md bg-inset">
            {/* eslint-disable-next-line @next/next/no-img-element -- Discord's signed attachment URLs expire; no point in optimising them */}
            <img src={a.url} alt={a.name} width={a.width ?? undefined} height={a.height ?? undefined} loading="lazy" className="h-auto max-h-72 w-auto max-w-full object-contain" />
          </a>
        ) : (
          <a key={a.url} href={a.url} target="_blank" rel="noreferrer noopener" className={buttonClass("secondary", "s")}>
            {a.name}
            <Icon name="external-trailing" />
          </a>
        ),
      )}
      {c.stickers.map((s) => (
        <span key={s} className="rounded-md bg-inset px-2 py-1 type-caption text-fg-secondary">
          {t("comments.sticker", { name: s })}
        </span>
      ))}
    </div>
  );
}

function Message({ c, cx, t, first }: { c: Comment; cx: TextContext; t: T; first: boolean }) {
  return (
    <div className="group/msg relative flex flex-col gap-1.5">
      {/* A follow-up message shows its time on hover, at the left, where the avatar would be. */}
      {!first && (
        <span className="absolute top-0.5 -left-12 hidden w-9 text-right type-caption text-fg-faint group-hover/msg:block">{time(c.at)}</span>
      )}
      <DiscordText text={c.content} cx={{ ...cx, names: c.names }} className="type-body-m text-fg-body" />
      <Extras c={c} t={t} />
      {/* A poll, an embed only, or text Discord didn't send us (the Message Content intent). */}
      {!c.content.trim() && !c.attachments.length && !c.stickers.length && (
        <p className="type-body-s text-fg-tertiary">{t("comments.noText")}</p>
      )}
      {c.edited && <span className="type-caption text-fg-faint">{t("comments.edited")}</span>}
    </div>
  );
}

function MessageGroup({ items, cx, t }: { items: Comment[]; cx: TextContext; t: T }) {
  const [head] = items;
  return (
    <li className="flex gap-3">
      <Avatar name={head.author.name} src={head.author.avatar} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {head.replyTo && (
          <p className="flex min-w-0 items-center gap-1.5 type-caption text-fg-tertiary">
            <span aria-hidden>↱</span>
            <span className="shrink-0 text-fg-secondary">@{head.replyTo.name}</span>
            <span className="truncate">{head.replyTo.content}</span>
          </p>
        )}
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate type-label-m text-fg">{head.author.name}</span>
          <Stamp iso={head.at} cx={cx} t={t} />
        </div>
        <div className="flex flex-col gap-1">
          {items.map((c, i) => (
            <Message key={c.id} c={c} cx={cx} t={t} first={i === 0} />
          ))}
        </div>
      </div>
    </li>
  );
}

/** The bot's own messages in the thread (a plan attached): a line with its link button. */
function Notice({ c, cx, t }: { c: Comment; cx: TextContext; t: T }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-inset px-3 py-2.5">
      <Icon name="check-circle" />
      <DiscordText text={c.content} cx={{ ...cx, names: c.names }} className="min-w-0 flex-1 type-body-s text-fg-secondary" />
      {c.links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 type-label-s text-fg-accent hover:underline">
          {l.label}
          <Icon name="external-accent" />
        </a>
      ))}
      <Stamp iso={c.at} cx={cx} t={t} />
    </li>
  );
}

function Groups({ groups, cx, t }: { groups: Group[]; cx: TextContext; t: T }) {
  return (
    <ol className="flex flex-col gap-5">
      {groups.map((g) =>
        g.notice ? <Notice key={g.items[0].id} c={g.items[0]} cx={cx} t={t} /> : <MessageGroup key={g.items[0].id} items={g.items} cx={cx} t={t} />,
      )}
    </ol>
  );
}

/**
 * «Комментарии»: the game's Discord thread (lib/discord/comments.ts), read and written by members. `comments` is null
 * for a viewer who isn't signed in (or isn't on the server any more): Discord talk stays behind the login.
 */
export function CommentsPanel({
  eventId,
  comments,
  viewer,
  now,
  locale,
  t,
}: {
  eventId: string;
  comments: Comments | null;
  viewer: Viewer | null;
  now: Date;
  locale: Locale;
  t: T;
}) {
  const ok = comments?.status === "ok" ? comments : null;
  const count = ok?.comments.filter((c) => !c.notice).length ?? 0;
  const cx: TextContext = {
    names: {},
    now,
    locale,
    unknown: { member: t("comments.unknownMember"), role: t("comments.unknownRole"), channel: t("comments.unknownChannel") },
  };
  const groups = ok ? grouped(ok.comments) : [];
  const older = groups.slice(0, Math.max(0, groups.length - SHOWN));
  const recent = groups.slice(older.length);

  let body: ReactNode;
  if (!comments) {
    body = viewer ? (
      <p className="type-body-m text-fg-secondary">{t("comments.membersOnly")}</p>
    ) : (
      <div className="flex flex-col items-start gap-3">
        <p className="type-body-m text-fg-secondary">{t("comments.signIn")}</p>
        <a href="/api/auth/login" className={buttonClass("secondary", "s")}>
          {t("comments.signInButton")}
        </a>
      </div>
    );
  } else if (comments.status === "notAnnounced") {
    body = <p className="type-body-m text-fg-secondary">{t("comments.notAnnounced")}</p>;
  } else if (comments.status === "error") {
    body = <p className="type-body-m text-fg-secondary">{t("comments.error")}</p>;
  } else {
    body = (
      <>
        <LiveRefresh url={`/api/events/${encodeURIComponent(eventId)}/comments`} version={comments.version} everyMs={10_000} />
        {comments.more && comments.url && (
          <a href={comments.url} target="_blank" rel="noreferrer noopener" className="inline-flex w-fit items-center gap-1 type-label-s text-fg-accent hover:underline">
            {t("comments.olderInDiscord")}
            <Icon name="external-accent" />
          </a>
        )}
        {older.length > 0 && (
          <details className="group/older">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 type-label-s text-fg-secondary hover:text-fg [&::-webkit-details-marker]:hidden">
              <Icon name="chevron-down" className="transition-transform group-open/older:rotate-180" />
              <span className="group-open/older:hidden">{plural(locale, "comments.earlier", older.reduce((n, g) => n + g.items.length, 0))}</span>
              <span className="hidden group-open/older:inline">{t("comments.hideEarlier")}</span>
            </summary>
            <div className="pt-5">
              <Groups groups={older} cx={cx} t={t} />
            </div>
          </details>
        )}
        {recent.length > 0 ? <Groups groups={recent} cx={cx} t={t} /> : <p className="type-body-m text-fg-secondary">{t("comments.empty")}</p>}
        {viewer && (
          <div className="border-t border-line pt-5">
            <CommentForm
              eventId={eventId}
              me={{ name: viewer.name, avatar: viewer.avatar }}
              max={COMMENT_MAX}
              labels={{
                placeholder: t("comments.placeholder"),
                send: t("comments.send"),
                sending: t("comments.sending"),
                hint: t("comments.hint"),
                errors: {
                  empty: t("comments.error.empty"),
                  tooLong: t("comments.error.tooLong", { max: COMMENT_MAX }),
                  forbidden: t("comments.error.forbidden"),
                  notAnnounced: t("comments.error.notAnnounced"),
                  discord: t("comments.error.discord"),
                },
              }}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <section id="comments" className="flex scroll-mt-24 flex-col gap-5 rounded-xl bg-surface p-6 lg:scroll-mt-[72px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="type-heading-m text-fg">{t("comments.title")}</h2>
          {count > 0 && <span className="type-label-m text-fg-tertiary">{count}</span>}
        </div>
        {ok?.url && (
          <ButtonLink href={ok.url} external size="s">
            {t("comments.openThread")}
            <Icon name="external-trailing" />
          </ButtonLink>
        )}
      </div>
      {body}
    </section>
  );
}
