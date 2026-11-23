"use client";

import Image from "next/image";
import { useState } from "react";
import { copyText } from "@/lib/clipboard";

/** Icon-only "copy" button (Figma: briefing header). Shows a short confirmation after copying. */
export function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? copiedLabel : label}
      aria-label={label}
      className="flex h-8 items-center gap-2 rounded-md bg-raised px-2 hover:bg-raised-hover"
    >
      <Image src="/icons/copy.svg" alt="" width={16} height={16} />
      {copied && <span className="type-caption-strong text-fg">{copiedLabel}</span>}
    </button>
  );
}
