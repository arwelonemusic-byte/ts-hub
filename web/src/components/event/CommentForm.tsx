"use client";

import { useActionState, useRef } from "react";
import { sendComment, type CommentState } from "@/lib/discord/actions";
import { buttonClass } from "../ui";
import { Avatar } from "./Avatar";

export interface CommentLabels {
  placeholder: string;
  send: string;
  sending: string;
  hint: string;
  errors: Record<NonNullable<CommentState>["error"], string>;
}

/**
 * The comment box under «Комментарии»: Enter sends (as in Discord), Shift+Enter starts a new line. A failed send keeps
 * the text; a sent one clears the box (React resets the form after its action) and the page re-renders with it.
 */
export function CommentForm({ eventId, me, max, labels }: { eventId: string; me: { name: string; avatar: string | null }; max: number; labels: CommentLabels }) {
  const [state, action, pending] = useActionState(sendComment, null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex gap-3">
      <Avatar name={me.name} src={me.avatar} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input type="hidden" name="event" value={eventId} />
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
