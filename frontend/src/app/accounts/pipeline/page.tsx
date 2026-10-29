"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { LeadPanel } from "@/components/accounts/LeadPanel";
import { TableWrap } from "@/components/ui/TableWrap";
import { usePagination } from "@/components/ui/Pagination";
import { getPipeline, type PipelineRow } from "@/lib/api/accounts";
import { TASK_TYPE_LABELS } from "@/lib/api/tasks";
import { formatDate } from "@/lib/utils/dates";

/** Pipeline stage shown for each acceptance state */
const STAGES: Record<string, { label: string; className: string }> = {
  draft: { label: "New", className: "bg-[var(--badge-default-bg)] text-[var(--badge-default-fg)]" },
  ready_for_review: { label: "In review", className: "bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]" },
  needs_research: { label: "Needs research", className: "bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]" },
  accepted: { label: "Accepted", className: "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]" },
  rejected: { label: "Rejected", className: "bg-[var(--red-tint)] text-[var(--red-active)]" },
};

function nextActionText(r: PipelineRow) {
  if (r.taskType) {
    const label = TASK_TYPE_LABELS[r.taskType];
    return r.nextAction ? `${label}: ${r.nextAction}` : label;
  }
  return r.nextAction;
}

function isOverdue(dueAt: string | null) {
  return dueAt ? new Date(dueAt).getTime() < Date.now() : false;
}

const notSet = "Not set";

function Pipeline({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<PipelineRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closePanel = useCallback(() => setSelectedId(null), []);
  const { pageItems, pager, topRef } = usePagination(rows ?? []);

  useEffect(() => {
    getPipeline(workspaceId)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [workspaceId]);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team execution"
        title="Opportunity pipeline"
        description="Assign ownership, record decisions and keep the next action visible."
      />

      {rows.length ? (
        <div ref={topRef} className="scroll-mt-24">
          <TableWrap>
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Opportunity pipeline</caption>
              <thead className="border-b border-[var(--line)] bg-[var(--table-head)] text-[13px] font-medium text-[var(--muted)]">
                <tr>
                  <th scope="col" className="px-5 py-4">Account</th>
                  <th scope="col" className="px-5 py-4">Stage</th>
                  <th scope="col" className="px-5 py-4">Owner</th>
                  <th scope="col" className="px-5 py-4">Next action</th>
                  <th scope="col" className="px-5 py-4">Due</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const stage = STAGES[r.acceptanceState] ?? STAGES.draft;
                  const action = nextActionText(r);
                  return (
                    <tr
                      key={r.accountId}
                      onClick={() => setSelectedId(r.accountId)}
                      className={`cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--chip-bg)] ${
                        r.accountId === selectedId ? "bg-[var(--red-tint)]" : ""
                      }`}
                    >
                      <td className="px-5 py-6 sm:pl-9">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(r.accountId);
                          }}
                          className="text-left font-semibold text-[var(--foreground)] hover:text-[var(--red-active)]"
                        >
                          {r.name}
                        </button>
                      </td>
                      <td className="px-5 py-6">
                        <span className={`inline-flex rounded-[5px] px-2.5 py-1 text-sm font-medium ${stage.className}`}>
                          {stage.label}
                        </span>
                      </td>
                      <td className="px-5 py-6">{r.owner ? r.owner.name : "Unassigned"}</td>
                      <td className="max-w-xs px-5 py-6">
                        {action ? <span className="line-clamp-2">{action}</span> : notSet}
                      </td>
                      <td className="whitespace-nowrap px-5 py-6">
                        {r.dueAt ? (
                          <span className={isOverdue(r.dueAt) ? "font-semibold text-[var(--red-active)]" : ""}>
                            {formatDate(r.dueAt)}
                            {isOverdue(r.dueAt) ? " · overdue" : ""}
                          </span>
                        ) : (
                          notSet
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          {pager}
        </div>
      ) : (
        <EmptyState title="No accounts in the pipeline yet" />
      )}

      <p className="rounded-[9px] bg-[var(--badge-blue-bg)] px-6 py-4 text-sm text-[var(--foreground)]">
        Open an account to assign a partner, add a next action, or record a rejection reason. Suppressed accounts are
        excluded from discovery.
      </p>

      {selectedId ? <LeadPanel accountId={selectedId} workspaceId={workspaceId} onClose={closePanel} /> : null}
    </div>
  );
}

export default function PipelinePage() {
  return <RequireCap cap="view_accounts">{(workspaceId) => <Pipeline workspaceId={workspaceId} />}</RequireCap>;
}
