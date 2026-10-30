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
import { useWorkspace } from "@/hooks/useWorkspace";
import { OpportunityStageBadge } from "@/components/accounts/OpportunityPanel";
import { formatMoney } from "@/lib/api/opportunities";

/** Sales-acceptance badge for each state. Deal stage is a separate column (see OpportunityStageBadge). */
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

type ViewKey = "all" | "needs_work" | "in_review" | "unowned_accepted" | "accepted" | "open_deals" | "overdue";

/** Filters over the same account list. They change what opens first, never what a role can access. */
const VIEWS: Record<ViewKey, { label: string; match: (r: PipelineRow) => boolean }> = {
  all: { label: "All accounts", match: () => true },
  needs_work: { label: "New & needs research", match: (r) => r.acceptanceState === "draft" || r.acceptanceState === "needs_research" },
  in_review: { label: "Waiting for review", match: (r) => r.acceptanceState === "ready_for_review" },
  unowned_accepted: { label: "Accepted, no owner", match: (r) => r.acceptanceState === "accepted" && !r.owner },
  accepted: { label: "Accepted", match: (r) => r.acceptanceState === "accepted" },
  open_deals: {
    label: "Open deals",
    match: (r) => Boolean(r.opportunity && r.opportunity.stage !== "won" && r.opportunity.stage !== "lost"),
  },
  overdue: { label: "Overdue", match: (r) => isOverdue(r.dueAt) },
};

/** Per role: which views appear, in order. The first is the default. */
const ROLE_VIEWS: Record<string, { views: ViewKey[]; hint: string; allLabel?: string }> = {
  researcher: {
    views: ["needs_work", "in_review", "all"],
    hint: "Showing accounts that need your research first. Switch to All accounts to see the whole pipeline.",
  },
  sales_reviewer: {
    views: ["in_review", "unowned_accepted", "accepted", "open_deals", "all"],
    hint: "Showing briefs waiting for your decision first. Accepted accounts without an owner need assigning.",
  },
  tenant_admin: {
    views: ["all", "needs_work", "in_review", "unowned_accepted", "open_deals", "overdue"],
    hint: "The whole workspace pipeline. Use the tabs to see where accounts are stuck.",
  },
  sdr: {
    views: ["all", "open_deals", "overdue"],
    allLabel: "My accounts",
    hint: "Only accounts you own or have a task on.",
  },
};

function Pipeline({ workspaceId }: { workspaceId: string }) {
  const { role } = useWorkspace();
  const roleViews = ROLE_VIEWS[role ?? ""] ?? { views: ["all"] as ViewKey[], hint: "" };
  const [rows, setRows] = useState<PipelineRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey | null>(null);
  const closePanel = useCallback(() => setSelectedId(null), []);
  const activeView = view && roleViews.views.includes(view) ? view : roleViews.views[0]!;
  const shown = (rows ?? []).filter(VIEWS[activeView].match);
  const { pageItems, pager, topRef } = usePagination(shown);

  const load = useCallback(() => {
    getPipeline(workspaceId)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team execution"
        title="Opportunity pipeline"
        description="Sales acceptance and deal stage side by side. Accepting a brief never moves a deal; each is updated on its own."
      />

      {rows.length && roleViews.views.length > 1 ? (
        <div className="space-y-2">
          <div role="tablist" aria-label="Pipeline views" className="flex flex-wrap gap-2">
            {roleViews.views.map((key) => {
              const count = rows.filter(VIEWS[key].match).length;
              const active = key === activeView;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(key)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                      : "border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--chip-bg)]"
                  }`}
                >
                  {key === "all" && roleViews.allLabel ? roleViews.allLabel : VIEWS[key].label}
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      active ? "bg-white/20 text-white" : "bg-[var(--chip-bg)] text-[var(--muted)]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {roleViews.hint ? <p className="text-xs text-[var(--muted)]">{roleViews.hint}</p> : null}
        </div>
      ) : null}

      {rows.length && !shown.length ? (
        <EmptyState title={`Nothing in “${VIEWS[activeView].label}” right now`} />
      ) : null}

      {shown.length ? (
        <div ref={topRef} className="scroll-mt-24">
          <TableWrap>
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Opportunity pipeline</caption>
              <thead className="border-b border-[var(--line)] bg-[var(--table-head)] text-[13px] font-medium text-[var(--muted)]">
                <tr>
                  <th scope="col" className="px-5 py-4">Account</th>
                  <th scope="col" className="px-5 py-4">Acceptance</th>
                  <th scope="col" className="px-5 py-4">Deal stage</th>
                  <th scope="col" className="px-5 py-4 text-right">Value</th>
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
                      <td className="px-5 py-6">
                        {r.opportunity ? (
                          <OpportunityStageBadge stage={r.opportunity.stage} />
                        ) : (
                          <span className="text-[var(--muted)]">No deal yet</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-6 text-right tabular-nums">
                        {r.opportunity?.valueAmount != null ? (
                          formatMoney(r.opportunity.valueAmount, r.opportunity.currency)
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
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
      ) : !rows.length ? (
        <EmptyState title="No accounts in the pipeline yet" />
      ) : null}

      <p className="rounded-[9px] bg-[var(--badge-blue-bg)] px-6 py-4 text-sm text-[var(--foreground)]">
        Open an account to assign a partner, add a next action, or record a rejection reason. Suppressed accounts are
        excluded from discovery.
      </p>

      {selectedId ? (
        <LeadPanel accountId={selectedId} workspaceId={workspaceId} onClose={closePanel} onOpportunitySaved={load} />
      ) : null}
    </div>
  );
}

export default function PipelinePage() {
  return <RequireCap cap="view_accounts">{(workspaceId) => <Pipeline workspaceId={workspaceId} />}</RequireCap>;
}
