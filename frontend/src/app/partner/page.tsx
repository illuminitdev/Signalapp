"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { listSharedHandoffs, type SharedHandoff } from "@/lib/api/handoffs";
import { formatDate } from "@/lib/utils/dates";
import { Card } from "@/components/ui/Card";
import { usePagination } from "@/components/ui/Pagination";

function Inbox({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<SharedHandoff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pageItems, pager, topRef } = usePagination(rows ?? []);

  useEffect(() => {
    listSharedHandoffs(workspaceId)
      .then((r) => setRows(r.handoffs))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [workspaceId]);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Partner"
        title="Accounts shared with you"
        description="Only accounts a sales reviewer has explicitly shared with you appear here, with only the details they chose to share."
      />
      {rows.length ? (
        <div>
          <ul ref={topRef} className="scroll-mt-24 space-y-3">
            {pageItems.map((h) => (
              <li key={h.id}>
                <Link href={`/partner/handoff?id=${h.id}`} className="block">
                  <Card className="!p-4 hover:border-[var(--red)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{h.accountName}</p>
                      <StatusBadge status={h.state} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Shared {formatDate(h.sharedAt)} · due {formatDate(h.dueAt)}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {pager}
        </div>
      ) : (
        <EmptyState title="Nothing has been shared with you yet" />
      )}
    </div>
  );
}

export default function PartnerInboxPage() {
  return <RequireCap cap="acknowledge_handoff">{(workspaceId) => <Inbox workspaceId={workspaceId} />}</RequireCap>;
}
