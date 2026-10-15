"use client";

import { useActionState, useRef } from "react";
import { buttonClass } from "../ui";
import { Avatar } from "./Avatar";

/** What the box shows after a send: an error keeps the text so nothing typed is lost. */
export type CommentFormState<E extends string> = { error: E; text: string } | null;

export interface CommentLabels<E extends string> {
  placeholder: string;
  send: string;
  sending: string;
  hint: string;
  errors: Record<E, string>;
}

/**
 * The comment box under «Комментарии»: Enter sends (as in Discord), Shift+Enter starts a new line. A failed send keeps
 * the text; a sent one clears the box (React resets the form after its action) and the page re-renders with it.
 * `action` is the server action that takes the comment (a game's: into its Discord thread; a map's: the hub's own
 * table), `fields` the hidden inputs saying what it's on.
 */
export function CommentForm<E extends string>({
  action: send,
  fields,
  me,
  max,
  labels,
}: {
  action: (prev: CommentFormState<E>, form: FormData) => Promise<CommentFormState<E>>;
  fields: Record<string, string>;
  me: { name: string; avatar: string | null };
  max: number;
  labels: CommentLabels<E>;
}) {
  const [state, action, pending] = useActionState(send, null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex gap-3">
      <Avatar name={me.name} src={me.avatar} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <textarea
          name="text"
          required
          maxLength={max}
          rows={1}
          defaultValue={state?.text}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (!pending && e.currentTarget.value.trim()) form.current?.requestSubmit();
          }}
          className="max-h-60 min-h-11 w-full resize-none rounded-lg border border-line bg-page px-3 py-2.5 type-body-m text-fg outline-none field-sizing-content placeholder:text-fg-faint focus:border-line-strong"
        />
        <div className="flex items-center justify-between gap-3">
          {state ? (
            <p role="alert" className="type-caption text-fg-danger">{labels.errors[state.error]}</p>
          ) : (
            <p className="type-caption text-fg-tertiary">{labels.hint}</p>
          )}
          <button type="submit" disabled={pending} className={buttonClass("primary", "s")}>
            {pending ? labels.sending : labels.send}
          </button>
        </div>
      </div>
    </form>
  );
}
