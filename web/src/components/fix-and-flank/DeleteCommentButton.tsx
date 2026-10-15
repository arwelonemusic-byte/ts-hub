"use client";

import { useTransition } from "react";
import { deleteMapComment } from "@/lib/fix-and-flank/actions";

/** «Удалить» under a map comment (its author's, or an admin's to take down), after a confirm. */
export function DeleteCommentButton({ id, labels }: { id: string; labels: { delete: string; confirm: string } }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(labels.confirm)) start(() => deleteMapComment(id).then(() => undefined));
      }}
      className="type-caption text-fg-tertiary hover:text-fg-danger disabled:opacity-60"
    >
      {labels.delete}
    </button>
  );
}
