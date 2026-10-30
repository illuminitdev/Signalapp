"use client";

import { Lightbulb, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTourHints } from "../../hooks/useTourHints";

/** Small "here's what to do" tip. ✕ hides it for this user until they choose "Show tips again". */
export function TourHint({ id, children }: { id: string; children: ReactNode }) {
  const { isDismissed, dismiss } = useTourHints();
  if (isDismissed(id)) return null;
  return (
    <div
      role="note"
      className="relative mb-4 flex max-w-xl items-start gap-2.5 rounded-[10px] border border-[var(--badge-amber-bg)] bg-[#fffaf0] py-2.5 pl-3 pr-9 text-sm text-[var(--foreground)] shadow-[0_6px_16px_-10px_rgba(23,44,64,0.35)]"
    >
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-[var(--badge-amber-fg)]" aria-hidden />
      <div className="leading-relaxed">{children}</div>
      <button
        type="button"
        onClick={() => dismiss(id)}
        aria-label="Close tip"
        title="Got it, hide this tip"
        className="absolute right-1.5 top-1.5 rounded-md p-1 text-[var(--muted)] hover:bg-white hover:text-[var(--foreground)]"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
