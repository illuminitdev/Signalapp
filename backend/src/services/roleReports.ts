import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "../db/client.js";
import {
  acceptanceDecisions,
  accounts,
  activities,
  evidence,
  handoffs,
  memberships,
  researchRuns,
  tasks,
  users,
} from "../db/schema/index.js";
import type { MembershipContext } from "../middleware/requireMembership.js";
import { getUsage } from "./budget.js";

const REVIEWER_DECISIONS = ["accepted", "needs_research", "rejected"] as const;
const OPEN_TASK = ["open", "in_progress"] as const;

type Cohort = { fromDate: Date; toDate: Date };

function scopeOf(m: MembershipContext, workspaceId: string) {
  return (table: { workspaceId: AnyPgColumn; tenantId: AnyPgColumn }) =>
    and(eq(table.workspaceId, workspaceId), eq(table.tenantId, m.tenantId));
}

/** Latest reviewer decision per account, so repeated decisions count once (R9). */
function latestByAccount<T extends { accountId: string; createdAt: Date }>(rows: T[]) {
  const latest = new Map<string, T>();
  for (const r of rows) {
    const prev = latest.get(r.accountId);
    if (!prev || r.createdAt > prev.createdAt) latest.set(r.accountId, r);
  }
  return latest;
}

/** SDR: only their own tasks and assigned accounts. */
async function sdrReport(m: MembershipContext, workspaceId: string, { fromDate, toDate }: Cohort) {
  const db = getDb();
  const scope = scopeOf(m, workspaceId);
  const now = new Date();

  const myTasks = await db
    .select({ id: tasks.id, type: tasks.type, status: tasks.status, dueAt: tasks.dueAt, accountId: tasks.accountId })
    .from(tasks)
    .where(and(scope(tasks), eq(tasks.ownerUserId, m.userId)));
  const open = myTasks.filter((t) => (OPEN_TASK as readonly string[]).includes(t.status));

  const acts = await db
    .select({ kind: activities.kind, taskId: activities.taskId })
    .from(activities)
    .where(
      and(
        scope(activities),
        eq(activities.actorUserId, m.userId),
        inArray(activities.kind, ["task_completed", "task_cancelled"]),
        gte(activities.createdAt, fromDate),
        lte(activities.createdAt, toDate),
      ),
    );
  const typeById = new Map(myTasks.map((t) => [t.id, t.type]));
  const completedByType: Record<string, number> = { research: 0, review: 0, call: 0, email: 0, follow_up: 0 };
  for (const a of acts) {
    if (a.kind !== "task_completed") continue;
    const type = (a.taskId && typeById.get(a.taskId)) || "unknown";
    completedByType[type] = (completedByType[type] ?? 0) + 1;
  }

  const owned = await db
    .select({ id: accounts.id, acceptanceState: accounts.acceptanceState })
    .from(accounts)
    .where(and(scope(accounts), eq(accounts.ownerUserId, m.userId), isNull(accounts.mergedIntoId)));

  return {
    openTasks: open.length,
    inProgressTasks: open.filter((t) => t.status === "in_progress").length,
    overdueTasks: open.filter((t) => t.dueAt && t.dueAt < now).length,
    dueToday: open.filter((t) => t.dueAt && t.dueAt >= now && t.dueAt.getTime() - now.getTime() < 86400000).length,
    completedTasks: acts.filter((a) => a.kind === "task_completed").length,
    cancelledTasks: acts.filter((a) => a.kind === "task_cancelled").length,
    completedByType,
    assignedAccounts: owned.length,
    acceptedAssignedAccounts: owned.filter((a) => a.acceptanceState === "accepted").length,
    accountsWithMyTasks: new Set(myTasks.map((t) => t.accountId)).size,
  };
}

/** Researcher: their own research runs, evidence reviews and briefs submitted. */
async function researcherReport(m: MembershipContext, workspaceId: string, { fromDate, toDate }: Cohort) {
  const db = getDb();
  const scope = scopeOf(m, workspaceId);

  const runs = await db
    .select({ status: researchRuns.status, mode: researchRuns.mode, accountId: researchRuns.accountId, resultJson: researchRuns.resultJson })
    .from(researchRuns)
    .where(
      and(
        scope(researchRuns),
        eq(researchRuns.createdBy, m.userId),
        // Scheduled monitor checks run on their own; they aren't this person's activity
        ne(researchRuns.mode, "monitor"),
        gte(researchRuns.createdAt, fromDate),
        lte(researchRuns.createdAt, toDate),
      ),
    );
  let companiesFound = 0;
  let noResults = 0;
  for (const r of runs) {
    if (r.status !== "completed") continue;
    try {
      const res = JSON.parse(r.resultJson ?? "{}") as { noResults?: boolean; rows?: unknown[] };
      if (res.noResults) noResults++;
      companiesFound += res.rows?.length ?? 0;
    } catch {
      /* malformed result: not counted */
    }
  }

  const reviewed = await db
    .select({ accountId: evidence.accountId })
    .from(evidence)
    .where(
      and(
        scope(evidence),
        eq(evidence.reviewedBy, m.userId),
        gte(evidence.reviewedAt, fromDate),
        lte(evidence.reviewedAt, toDate),
      ),
    );

  const submissions = await db
    .select({ accountId: acceptanceDecisions.accountId })
    .from(acceptanceDecisions)
    .where(
      and(
        scope(acceptanceDecisions),
        eq(acceptanceDecisions.actorUserId, m.userId),
        eq(acceptanceDecisions.toState, "ready_for_review"),
        gte(acceptanceDecisions.createdAt, fromDate),
        lte(acceptanceDecisions.createdAt, toDate),
      ),
    );
  const submittedAccounts = [...new Set(submissions.map((s) => s.accountId))];

  // What reviewers decided on the accounts this researcher submitted (latest decision each)
  const decisions = submittedAccounts.length
    ? await db
        .select({
          accountId: acceptanceDecisions.accountId,
          toState: acceptanceDecisions.toState,
          reasonCategory: acceptanceDecisions.reasonCategory,
          createdAt: acceptanceDecisions.createdAt,
        })
        .from(acceptanceDecisions)
        .where(
          and(
            scope(acceptanceDecisions),
            inArray(acceptanceDecisions.accountId, submittedAccounts),
            inArray(acceptanceDecisions.toState, [...REVIEWER_DECISIONS]),
          ),
        )
    : [];
  const latest = [...latestByAccount(decisions).values()];
  const returnReasons: Record<string, number> = {};
  for (const d of latest) {
    if (d.toState === "accepted") continue;
    const key = d.reasonCategory || "unspecified";
    returnReasons[key] = (returnReasons[key] ?? 0) + 1;
  }

  return {
    researchRuns: runs.length,
    runsCompleted: runs.filter((r) => r.status === "completed").length,
    runsFailed: runs.filter((r) => r.status === "failed").length,
    runsWithNoResults: noResults,
    discoveryRuns: runs.filter((r) => r.mode === "discovery").length,
    companiesFound,
    accountsResearched: new Set(runs.map((r) => r.accountId).filter(Boolean)).size,
    evidenceReviewed: reviewed.length,
    accountsWithReviewedEvidence: new Set(reviewed.map((r) => r.accountId)).size,
    briefsSubmitted: submittedAccounts.length,
    submittedAwaitingDecision: submittedAccounts.length - latest.length,
    submittedAccepted: latest.filter((d) => d.toState === "accepted").length,
    submittedReturned: latest.filter((d) => d.toState === "needs_research").length,
    submittedRejected: latest.filter((d) => d.toState === "rejected").length,
    returnReasons,
  };
}

/** Sales reviewer: their own decisions, the live review queue and handoffs they prepared. */
async function reviewerReport(m: MembershipContext, workspaceId: string, { fromDate, toDate }: Cohort) {
  const db = getDb();
  const scope = scopeOf(m, workspaceId);

  const mine = await db
    .select({
      accountId: acceptanceDecisions.accountId,
      toState: acceptanceDecisions.toState,
      reasonCategory: acceptanceDecisions.reasonCategory,
      createdAt: acceptanceDecisions.createdAt,
    })
    .from(acceptanceDecisions)
    .where(
      and(
        scope(acceptanceDecisions),
        eq(acceptanceDecisions.actorUserId, m.userId),
        inArray(acceptanceDecisions.toState, [...REVIEWER_DECISIONS]),
        gte(acceptanceDecisions.createdAt, fromDate),
        lte(acceptanceDecisions.createdAt, toDate),
      ),
    );
  const latest = [...latestByAccount(mine).values()];
  const accepted = latest.filter((d) => d.toState === "accepted").length;
  const reasons: Record<string, number> = {};
  for (const d of latest) {
    if (d.toState === "accepted") continue;
    const key = d.reasonCategory || "unspecified";
    reasons[key] = (reasons[key] ?? 0) + 1;
  }

  const queue = await db
    .select({ id: accounts.id, updatedAt: accounts.updatedAt })
    .from(accounts)
    .where(and(scope(accounts), eq(accounts.acceptanceState, "ready_for_review"), isNull(accounts.mergedIntoId)));
  const now = Date.now();
  const oldestWaitingDays = queue.length
    ? Math.floor((now - Math.min(...queue.map((q) => q.updatedAt.getTime()))) / 86400000)
    : null;

  const myHandoffs = await db
    .select({ state: handoffs.state })
    .from(handoffs)
    .where(
      and(
        scope(handoffs),
        eq(handoffs.createdBy, m.userId),
        gte(handoffs.createdAt, fromDate),
        lte(handoffs.createdAt, toDate),
      ),
    );
  const handoffsByState: Record<string, number> = {};
  for (const h of myHandoffs) handoffsByState[h.state] = (handoffsByState[h.state] ?? 0) + 1;

  return {
    decisionEvents: mine.length,
    accountsDecided: latest.length,
    accepted,
    returned: latest.filter((d) => d.toState === "needs_research").length,
    rejected: latest.filter((d) => d.toState === "rejected").length,
    acceptanceRate: latest.length ? accepted / latest.length : null,
    reasons,
    queueWaiting: queue.length,
    oldestWaitingDays,
    handoffsPrepared: myHandoffs.length,
    handoffsByState,
  };
}

/** Tenant admin: research usage against the limit and per-member activity. */
async function adminReport(m: MembershipContext, workspaceId: string, { fromDate, toDate }: Cohort) {
  const db = getDb();
  const scope = scopeOf(m, workspaceId);
  const inCohort = (col: AnyPgColumn) => and(gte(col, fromDate), lte(col, toDate));

  const [usage, members, runs, decisions, completed, openTasks, reviewed] = await Promise.all([
    getUsage(m.tenantId),
    db
      .select({ userId: users.id, name: users.name, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(eq(memberships.workspaceId, workspaceId), isNull(memberships.revokedAt))),
    db.select({ by: researchRuns.createdBy }).from(researchRuns).where(and(scope(researchRuns), inCohort(researchRuns.createdAt))),
    db
      .select({ by: acceptanceDecisions.actorUserId, toState: acceptanceDecisions.toState })
      .from(acceptanceDecisions)
      .where(and(scope(acceptanceDecisions), inCohort(acceptanceDecisions.createdAt))),
    db
      .select({ by: activities.actorUserId })
      .from(activities)
      .where(and(scope(activities), eq(activities.kind, "task_completed"), inCohort(activities.createdAt))),
    db
      .select({ owner: tasks.ownerUserId })
      .from(tasks)
      .where(and(scope(tasks), inArray(tasks.status, [...OPEN_TASK]))),
    db.select({ by: evidence.reviewedBy }).from(evidence).where(and(scope(evidence), inCohort(evidence.reviewedAt))),
  ]);

  const tally = (ids: (string | null)[]) => {
    const map = new Map<string, number>();
    for (const id of ids) if (id) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  };
  const runsBy = tally(runs.map((r) => r.by));
  const submittedBy = tally(decisions.filter((d) => d.toState === "ready_for_review").map((d) => d.by));
  const decidedBy = tally(
    decisions.filter((d) => (REVIEWER_DECISIONS as readonly string[]).includes(d.toState)).map((d) => d.by),
  );
  const completedBy = tally(completed.map((c) => c.by));
  const openBy = tally(openTasks.map((t) => t.owner));
  const reviewedBy = tally(reviewed.map((r) => r.by));

  // One row per person; a user holding two roles in the workspace appears once with both roles
  const people = new Map<string, { userId: string; name: string; roles: string[] }>();
  for (const mem of members) {
    const p = people.get(mem.userId) ?? { userId: mem.userId, name: mem.name, roles: [] };
    if (!p.roles.includes(mem.role)) p.roles.push(mem.role);
    people.set(mem.userId, p);
  }

  return {
    usage,
    team: [...people.values()]
      .filter((p) => !p.roles.every((r) => r === "partner"))
      .map((p) => ({
        ...p,
        researchRuns: runsBy.get(p.userId) ?? 0,
        evidenceReviewed: reviewedBy.get(p.userId) ?? 0,
        briefsSubmitted: submittedBy.get(p.userId) ?? 0,
        reviewerDecisions: decidedBy.get(p.userId) ?? 0,
        tasksCompleted: completedBy.get(p.userId) ?? 0,
        openTasks: openBy.get(p.userId) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export type ReportView = "admin" | "researcher" | "reviewer" | "sdr" | "analyst";

export function reportViewFor(role: string): ReportView {
  switch (role) {
    case "tenant_admin":
      return "admin";
    case "researcher":
      return "researcher";
    case "sales_reviewer":
      return "reviewer";
    case "sdr":
      return "sdr";
    default:
      return "analyst";
  }
}

/** The caller's own section of the Reports page, chosen by their workspace role. */
export async function computeRoleReport(m: MembershipContext, workspaceId: string, from?: string, to?: string) {
  const cohort = {
    fromDate: from ? new Date(from) : new Date(Date.now() - 90 * 86400000),
    toDate: to ? new Date(to) : new Date(),
  };
  const view = reportViewFor(m.role);
  switch (view) {
    case "admin":
      return { view, admin: await adminReport(m, workspaceId, cohort) };
    case "researcher":
      return { view, researcher: await researcherReport(m, workspaceId, cohort) };
    case "reviewer":
      return { view, reviewer: await reviewerReport(m, workspaceId, cohort) };
    case "sdr":
      return { view, sdr: await sdrReport(m, workspaceId, cohort) };
    default:
      return { view };
  }
}
