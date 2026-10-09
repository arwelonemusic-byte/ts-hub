"use client";

import { useState } from "react";

/**
 * A value that copies itself to the clipboard on click. Long values (scenario IDs) are
 * truncated with an ellipsis; the full value is in the tooltip and is what gets copied.
 */
export function CopyValue({ value, hint, copiedLabel }: { value: string; hint: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      // No async clipboard (plain-http host, permissions): fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    }
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`${value}\n${hint}`}
      className={`min-w-0 truncate text-left underline-offset-2 hover:underline ${copied ? "text-fg-success" : "text-fg"}`}
    >
      {copied ? copiedLabel : value}
    </button>
  );
}
