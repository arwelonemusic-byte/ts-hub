"use client";

import { useTransition } from "react";

/**
 * «Удалить» under one of the hub's own comments (its writer's, or an admin's to take down), after a confirm. `action`
 * is the server action that takes it down (a map's, a mission's).
 */
export function DeleteCommentButton({
  id,
  action,
  labels,
}: {
  id: string;
  action: (id: string) => Promise<unknown>;
  labels: { delete: string; confirm: string };
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(labels.confirm)) start(() => action(id).then(() => undefined));
      }}
      className="type-caption text-fg-tertiary hover:text-fg-danger disabled:opacity-60"
    >
      {labels.delete}
    </button>
  );
}
