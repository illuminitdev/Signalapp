"use client";

import { Check } from "lucide-react";

export type GuideStep = { key: string; label: string };

/**
 * Numbered step pills, like a checkout: the current step is highlighted, finished steps show a
 * tick and can be clicked to go back, later steps are muted until reached.
 */
export function Stepper({
  steps,
  current,
  reachable,
  onSelect,
}: {
  steps: GuideStep[];
  /** Index of the step on screen */
  current: number;
  /** Highest index the user may jump to (everything before it is done) */
  reachable: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Progress" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-max items-center gap-2.5">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          const isDone = i < current || (i < reachable && !isCurrent);
          const clickable = i <= reachable && !isCurrent;
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={!clickable}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onSelect(i)}
                className={`inline-flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-sm transition-colors ${
                  isCurrent
                    ? "border-[var(--red)] bg-[var(--red-tint)] font-semibold text-[var(--foreground)] shadow-[0_0_0_3px_var(--red-tint)]"
                    : isDone
                      ? "border-[var(--line)] bg-white font-medium text-[var(--foreground)] hover:bg-[var(--chip-bg)]"
                      : "border-[var(--line)] bg-white/70 text-[var(--muted)]"
                } disabled:cursor-default`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCurrent
                      ? "bg-[var(--red)] text-white"
                      : isDone
                        ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]"
                        : "bg-[var(--chip-bg)] text-[var(--muted)]"
                  }`}
                  aria-hidden
                >
                  {isDone ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
