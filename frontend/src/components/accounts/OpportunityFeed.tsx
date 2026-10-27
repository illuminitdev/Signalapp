"use client";

import Link from "next/link";
import type { Account } from "../../lib/api/accounts";
import { StatusBadge } from "../common/StatusBadge";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../common/EmptyState";
import { usePagination } from "../ui/Pagination";

export function OpportunityFeed({ accounts }: { accounts: Account[] }) {
  const { pageItems, pager, topRef } = usePagination(accounts);
  if (!accounts.length) {
    return (
      <EmptyState
        title="No opportunities yet"
        detail="Import accounts or run Search, then complete Exa research to populate this feed."
      />
    );
  }

  return (
    <div ref={topRef} className="flex flex-col gap-[23px] scroll-mt-24">
      {pageItems.map((a) => (
        <article
          key={a.id}
          className="rounded-[10px] border border-[var(--line)] bg-white p-[25px]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.researchState} />
            <StatusBadge status={a.acceptanceState} />
            {a.researchState === "unresearched" ? <Badge>New</Badge> : null}
          </div>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-bold tracking-tight">{a.name}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {[a.country, a.domain].filter(Boolean).join(" · ") || "No location / domain"}
              </p>
            </div>
            <p className="text-sm">
              <span className="text-[22px] font-semibold tracking-tight">
                {a.fitScore ?? "—"}
              </span>
              <span className="ml-1 text-[var(--muted)]">priority / 100</span>
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                Why now
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--foreground)]">
                {a.researchState === "researched"
                  ? "Cited infrastructure signals available — review evidence before outreach."
                  : "Awaiting research. Run Exa research to surface expansion, hiring, or refresh signals."}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                Why our offer
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--foreground)]">
                Match against workspace offer and targeting in Settings before qualifying.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <p className="text-xs text-[var(--muted)]">
              {a.acceptanceState.replaceAll("_", " ")} · research {a.researchState}
            </p>
            <div className="flex gap-2">
              <Link href={`/accounts/${a.id}`}>
                <Button variant="secondary">Open brief</Button>
              </Link>
              <Link href={`/accounts/${a.id}/qualification`}>
                <Button variant="primary">Review &amp; qualify →</Button>
              </Link>
            </div>
          </div>
        </article>
      ))}
      {pager}
    </div>
  );
}
