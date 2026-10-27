import { shortDay, time } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { DeleteCommentButton } from "./DeleteCommentButton";

/** One of the comments the hub keeps itself (a map's, a mission's), not a game's Discord thread. */
export interface ListedComment {
  id: string;
  author: string;
  avatar: string | null;
  body: string;
  createdAt: string;
}

/**
 * The hub's own comments in the order given (newest first): who, when and the text as typed. «Удалить» shows on the
 * ones `canDelete` allows and calls `remove`, a server action; `tag` puts a word after the name (a mission's author).
 */
export function CommentList<C extends ListedComment>({
  comments,
  canDelete,
  tag,
  remove,
  labels,
  now,
  locale,
}: {
  comments: C[];
  canDelete: (c: C) => boolean;
  tag?: (c: C) => string | null;
  remove: (id: string) => Promise<unknown>;
  labels: { delete: string; confirm: string };
  now: Date;
  locale: Locale;
}) {
  return (
    <ol className="flex flex-col">
      {comments.map((c) => {
        const label = tag?.(c);
        return (
          <li key={c.id} className="flex gap-3 border-t border-line py-3">
            <Avatar name={c.author} src={c.avatar} size={32} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="type-label-s text-fg">{c.author}</span>
                {label && <span className="type-caption text-fg-accent">{label}</span>}
                <span className="type-caption text-fg-tertiary">
                  {shortDay(c.createdAt, now, locale)}, {time(c.createdAt)}
                </span>
                {canDelete(c) && (
                  <span className="ml-auto">
                    <DeleteCommentButton id={c.id} action={remove} labels={labels} />
                  </span>
                )}
              </span>
              <p className="whitespace-pre-line break-words type-body-s text-fg-body">{c.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
