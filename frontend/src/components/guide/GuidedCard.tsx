"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/Button";

/**
 * The big card for one step: "STEP 2 OF 4", a title, a short "why", the step body and a
 * Back / Next footer. Next stays disabled until the step is complete, and says why.
 */
export function GuidedCard({
  index,
  total,
  eyebrow,
  title,
  why,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabledReason,
  busy,
  hideNext,
}: {
  index: number;
  total: number;
  eyebrow?: string;
  title: string;
  why?: ReactNode;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  /** When set, Next is disabled and this explains what is missing */
  nextDisabledReason?: string | null;
  busy?: boolean;
  hideNext?: boolean;
}) {
  return (
    <section className="rounded-[16px] border border-[var(--line)] bg-white px-6 py-7 shadow-[0_10px_30px_-18px_rgba(23,44,64,0.25)] sm:px-9 sm:py-9">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {eyebrow ? `${eyebrow} · ` : ""}Step {index + 1} of {total}
      </p>
      <h1 className="mt-2 text-[28px] leading-tight text-[var(--foreground)] sm:text-[32px]">{title}</h1>
      {why ? <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-[var(--muted)]">{why}</div> : null}

      <div className="mt-7">{children}</div>

      {onBack || (onNext && !hideNext) ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
          <div>
            {onBack ? (
              <Button onClick={onBack} disabled={busy}>
                <span className="inline-flex items-center gap-1.5">
                  <ArrowLeft size={15} aria-hidden /> Back
                </span>
              </Button>
            ) : null}
          </div>
          {onNext && !hideNext ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {nextDisabledReason ? <span className="text-xs text-[var(--muted)]">{nextDisabledReason}</span> : null}
              <Button variant="primary" onClick={onNext} disabled={Boolean(nextDisabledReason) || busy}>
                <span className="inline-flex items-center gap-1.5">
                  {busy ? "Working…" : nextLabel} {!busy ? <ArrowRight size={15} aria-hidden /> : null}
                </span>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
