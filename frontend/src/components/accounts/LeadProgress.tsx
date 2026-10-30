"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "../ui/Card";

export type LeadStep = {
  key: string;
  title: string;
  /** Where this step stands now, in plain words */
  status: string;
  done: boolean;
  /** Buttons or links for this step (shown for every step, done or not) */
  actions?: ReactNode;
};

/**
 * The account's whole journey as numbered steps: what's done, what's next, and the button for
 * each. Every step is always listed, so anyone opening the account sees the full picture.
 */
export function LeadProgress({ steps, footer }: { steps: LeadStep[]; footer?: ReactNode }) {
  const current = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px]">Lead progress</h2>
        <span className="text-xs text-[var(--muted)]">
          {doneCount} of {steps.length} steps done
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--chip-bg)]" aria-hidden>
        <div className="h-full rounded-full bg-[var(--badge-green-fg)] transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ol className="mt-5">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className="relative flex gap-4 pb-5 last:pb-0" aria-current={isCurrent ? "step" : undefined}>
              {/* Connector line between the step circles */}
              {!last ? (
                <span
                  aria-hidden
                  className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${s.done ? "bg-[var(--badge-green-fg)]" : "bg-[var(--line)]"}`}
                />
              ) : null}
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  s.done
                    ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]"
                    : isCurrent
                      ? "bg-[var(--red)] text-white shadow-[0_0_0_4px_var(--red-tint)]"
                      : "border border-[var(--line)] bg-white text-[var(--muted)]"
                }`}
              >
                {s.done ? <Check size={16} strokeWidth={2.5} aria-label="Done" /> : i + 1}
              </span>
              <div
                className={`flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-[10px] px-3 py-1.5 ${
                  isCurrent ? "bg-[var(--red-tint)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-[var(--foreground)]">
                    {s.title}
                    {isCurrent ? (
                      <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--red-active)]">
                        Next
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[var(--muted)]">{s.status}</p>
                </div>
                {s.actions ? <div className="flex flex-wrap items-center gap-2">{s.actions}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {footer ? <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] pt-4 text-sm">{footer}</div> : null}
    </Card>
  );
}
