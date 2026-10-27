"use client";

import { useState } from "react";
import { usePagination } from "../ui/Pagination";
import { formatDate } from "../../lib/utils/dates";
import { reviewEvidence, type EvidenceItem } from "../../lib/api/accounts";
import { StatusBadge } from "../common/StatusBadge";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FormError } from "../ui/Field";

export function EvidenceList({
  items,
  workspaceId,
  canReview = false,
  onChanged,
}: {
  items: EvidenceItem[];
  workspaceId?: string;
  canReview?: boolean;
  onChanged?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pageItems, pager, topRef } = usePagination(items);

  if (!items.length) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No cited evidence yet. Run research to collect sources — an empty result is not a negative fact.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <ul ref={topRef} className="scroll-mt-24 space-y-3">
        {pageItems.map((e) => (
          <li key={e.id}>
            <Card className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-semibold text-[var(--red-active)] hover:underline"
                  >
                    {e.sourceTitle || e.sourceUrl}
                  </a>
                  <p className="text-xs text-[var(--muted)]">
                    {[e.publisher, e.sourceCountry].filter(Boolean).join(" · ") || "Publisher unknown"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={e.freshness} />
                  {e.contradiction ? <Badge tone="red">Contradictory sources</Badge> : null}
                  {e.reviewedAt ? <Badge tone="green">Reviewed</Badge> : <Badge>Not reviewed</Badge>}
                </div>
              </div>
              {e.excerpt ? (
                <blockquote className="mt-2 border-l-2 border-[var(--red)] pl-3 text-sm italic text-[var(--foreground)]">
                  {e.excerpt}
                </blockquote>
              ) : null}
              <dl className="mt-3 grid gap-1 text-xs text-[var(--muted)] sm:grid-cols-3">
                <div>
                  <dt className="font-semibold">Event date</dt>
                  <dd>{e.eventDate ? formatDate(e.eventDate) : "Unknown"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Discovered</dt>
                  <dd>{formatDate(e.discoveredAt)}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Last checked</dt>
                  <dd>{formatDate(e.checkedAt)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Why it matched: {e.matchRationale ?? "—"} · Provider ref {e.providerRequestRef || "—"} · Extraction v
                {e.extractionVersion}
              </p>
              {canReview && workspaceId ? (
                <Button
                  className="mt-3"
                  variant={e.reviewedAt ? "ghost" : "secondary"}
                  disabled={busyId === e.id}
                  onClick={async () => {
                    setBusyId(e.id);
                    setError(null);
                    try {
                      await reviewEvidence(e.id, workspaceId, !e.reviewedAt);
                      onChanged?.();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not update review");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  {e.reviewedAt ? "Clear review" : "Mark as reviewed"}
                </Button>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      {pager}
    </div>
  );
}
