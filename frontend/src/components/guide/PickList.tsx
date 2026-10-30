"use client";

import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";

export type PickItem = { id: string; title: string; subtitle?: ReactNode; badge?: ReactNode; meta?: ReactNode };

/** Searchable single-choice list for "pick the account / task to work on" steps. */
export function PickList({
  items,
  selectedId,
  onSelect,
  empty,
  label,
}: {
  items: PickItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty: ReactNode;
  label: string;
}) {
  const [q, setQ] = useState("");
  const shown = items.filter((i) => i.title.toLowerCase().includes(q.trim().toLowerCase()));
  if (!items.length) {
    return <div className="rounded-[12px] border border-dashed border-[var(--input-border)] px-6 py-10 text-center text-sm text-[var(--muted)]">{empty}</div>;
  }
  return (
    <div className="space-y-3">
      {items.length > 6 ? (
        <div className="relative max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
          <input
            aria-label={`Search ${label}`}
            className="w-full rounded-[9px] border border-[var(--input-border)] bg-white py-2 pl-9 pr-3 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${label}`}
          />
        </div>
      ) : null}
      <ul role="radiogroup" aria-label={label} className="divide-y divide-[var(--line)] rounded-[12px] border border-[var(--line)]">
        {shown.map((i) => {
          const on = i.id === selectedId;
          return (
            <li key={i.id}>
              <label className={`flex cursor-pointer items-start gap-3 px-4 py-3.5 ${on ? "bg-[var(--red-tint)]" : "hover:bg-[var(--chip-bg)]"}`}>
                <input type="radio" name={label} className="mt-1 h-4 w-4" checked={on} onChange={() => onSelect(i.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--foreground)]">{i.title}</span>
                    {i.badge}
                  </span>
                  {i.subtitle ? <span className="mt-0.5 block text-sm text-[var(--muted)]">{i.subtitle}</span> : null}
                </span>
                {i.meta ? <span className="shrink-0 text-sm text-[var(--muted)]">{i.meta}</span> : null}
              </label>
            </li>
          );
        })}
        {!shown.length ? <li className="px-4 py-4 text-sm text-[var(--muted)]">No match for “{q}”.</li> : null}
      </ul>
    </div>
  );
}
