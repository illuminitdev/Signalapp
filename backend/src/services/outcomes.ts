import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "../db/client.js";
import {
  acceptanceDecisions,
  activities,
  evidence,
  handoffs,
  researchRuns,
  tasks,
  workspaces,
} from "../db/schema/index.js";

const REVIEWER_DECISIONS = ["accepted", "needs_research", "rejected"] as const;

/**
 * Event-based outcome metrics for a cohort (R9 / gate 11). Every count reconciles
 * to rows in acceptance_decisions, activities, evidence, handoffs and research_runs.
 */
export async function computeOutcomes(tenantId: string, workspaceId: string, from?: string, to?: string) {
  const db = getDb();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 86400000);
  const toDate = to ? new Date(to) : new Date();

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const currency = ws?.currency ?? "GBP";
  const scope = (table: { workspaceId: AnyPgColumn; tenantId: AnyPgColumn }) =>
    and(eq(table.workspaceId, workspaceId), eq(table.tenantId, tenantId));

  const decisions = await db
    .select()
    .from(acceptanceDecisions)
    .where(
      and(
        scope(acceptanceDecisions),
        inArray(acceptanceDecisions.toState, [...REVIEWER_DECISIONS]),
        gte(acceptanceDecisions.createdAt, fromDate),
        lte(acceptanceDecisions.createdAt, toDate),
      ),
    );

  // Latest-decision rule: each account counts once, by its most recent reviewer decision in the cohort
  const latest = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) {
    const prev = latest.get(d.accountId);
    if (!prev || d.createdAt > prev.createdAt) latest.set(d.accountId, d);
  }
  const latestStates = [...latest.values()].map((d) => d.toState);
  const accepted = latestStates.filter((s) => s === "accepted").length;
  const returned = latestStates.filter((s) => s === "needs_research").length;
  const rejected = latestStates.filter((s) => s === "rejected").length;
  const decided = latest.size;

  const reviewedEvidence = await db
    .select({ accountId: evidence.accountId })
    .from(evidence)
    .where(and(scope(evidence), gte(evidence.reviewedAt, fromDate), lte(evidence.reviewedAt, toDate)));
  const researchReviewedAccounts = new Set(reviewedEvidence.map((e) => e.accountId)).size;

  const acts = await db
    .select({ kind: activities.kind, taskId: activities.taskId })
    .from(activities)
    .where(and(scope(activities), gte(activities.createdAt, fromDate), lte(activities.createdAt, toDate)));
  const completedActs = acts.filter((a) => a.kind === "task_completed");
  const taskIds = completedActs.map((a) => a.taskId).filter((id): id is string => Boolean(id));
  const taskTypes = taskIds.length
    ? await db.select({ id: tasks.id, type: tasks.type }).from(tasks).where(inArray(tasks.id, taskIds))
    : [];
  const typeById = new Map(taskTypes.map((t) => [t.id, t.type]));
  const activityByType: Record<string, number> = { research: 0, review: 0, call: 0, email: 0, follow_up: 0 };
  for (const a of completedActs) {
    const type = (a.taskId && typeById.get(a.taskId)) || "unknown";
    activityByType[type] = (activityByType[type] ?? 0) + 1;
  }

  const handoffRows = await db
    .select({ state: handoffs.state, createdAt: handoffs.createdAt, sharedAt: handoffs.sharedAt })
    .from(handoffs)
    .where(and(scope(handoffs), gte(handoffs.createdAt, fromDate), lte(handoffs.createdAt, toDate)));

  const runs = await db
    .select({ status: researchRuns.status, resultJson: researchRuns.resultJson, mode: researchRuns.mode })
    .from(researchRuns)
    .where(and(scope(researchRuns), gte(researchRuns.createdAt, fromDate), lte(researchRuns.createdAt, toDate)));
  const noResults = runs.filter((r) => {
    try {
      return r.status === "completed" && JSON.parse(r.resultJson ?? "{}").noResults === true;
    } catch {
      return false;
    }
  }).length;
  const evidenceCreated = await db
    .select({ reviewedAt: evidence.reviewedAt })
    .from(evidence)
    .where(and(scope(evidence), gte(evidence.discoveredAt, fromDate), lte(evidence.discoveredAt, toDate)));

  return {
    cohort: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      dateBasis: "Event timestamp (decision, review, activity, handoff creation) in UTC",
      decisionRule: "Latest reviewer decision per account within the cohort",
    },
    currency,
    denominators: {
      accountsWithReviewerDecision: decided,
    },
    metrics: {
      uniqueResearchReviewedAccounts: researchReviewedAccounts,
      explicitSalesAccepted: accepted,
      returnedDecisions: returned,
      rejectedDecisions: rejected,
      acceptanceRate: decided === 0 ? null : accepted / decided,
      reviewerDecisionEvents: decisions.length,
      completedSdrActions: completedActs.length,
      cancelledSdrActions: acts.filter((a) => a.kind === "task_cancelled").length,
      partnerHandoffsPrepared: handoffRows.length,
      partnerHandoffsShared: handoffRows.filter((h) => h.sharedAt).length,
      // Phase 1 has no CRM connection: opportunities and meetings are not inferred
      crmOpportunities: null,
      meetings: null,
      attribution: "unassigned",
    },
    breakdowns: {
      activityByTaskType: activityByType,
      researchQuality: {
        runsQueuedOrRunning: runs.filter((r) => ["queued", "running", "retrying"].includes(r.status)).length,
        runsCompleted: runs.filter((r) => r.status === "completed").length,
        runsFailed: runs.filter((r) => r.status === "failed").length,
        runsWithNoResults: noResults,
        discoveryRuns: runs.filter((r) => r.mode === "discovery").length,
        evidenceDiscovered: evidenceCreated.length,
        evidenceReviewed: evidenceCreated.filter((e) => e.reviewedAt).length,
      },
    },
    notes: [
      "Acceptance rate = distinct accounts whose latest reviewer decision is Accepted ÷ distinct accounts with a reviewer decision in the cohort",
      "Task completion is an activity count; it never changes pipeline stage or records a meeting",
      `Monetary values are reported in ${currency}; Phase 1 records no opportunity values (CRM not connected)`,
      "Meetings booked/attended are only reported from connected CRM or user-entered events",
    ],
  };
}
