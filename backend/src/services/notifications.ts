import { and, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  acceptanceDecisions,
  accounts,
  auditEvents,
  changeEvents,
  handoffAccess,
  handoffs,
  tasks,
} from "../db/schema/index.js";
import { hasCapability, type Capability } from "../auth/permissions.js";
import { accountScope, type MembershipContext } from "../middleware/requireMembership.js";

/**
 * One bell entry. `times` holds when each underlying thing happened (newest first), so the
 * browser can show how many are new since this person last looked. `href` is a page path
 * inside their own portal ("/accounts/qualify"); the portal prefix is added in the browser.
 */
export type NotificationItem = {
  key: string;
  kind: "tasks" | "review" | "returned" | "decided" | "shared" | "handoff_reply" | "changes" | "accepted";
  label: string;
  detail: string | null;
  href: string;
  count: number;
  times: string[];
};

/** Recent events (e.g. partner replies) are shown for this long; queues (open work) always show. */
const RECENT_DAYS = 30;
const MAX_TIMES = 50;

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const timesOf = (dates: Array<Date | null | undefined>) =>
  dates
    .map(iso)
    .filter((t): t is string => Boolean(t))
    .sort()
    .reverse()
    .slice(0, MAX_TIMES);

/**
 * In-app notifications for one member, built from live records and their role's permissions.
 * Nothing is sent anywhere (no email): this only tells people what is waiting in their portal.
 */
export async function notificationsFor(m: MembershipContext, email: string): Promise<NotificationItem[]> {
  const db = getDb();
  const can = (cap: Capability) => hasCapability(m.role, cap);
  const since = new Date(Date.now() - RECENT_DAYS * 86400000);
  const items: NotificationItem[] = [];
  const ws = and(eq(tasks.tenantId, m.tenantId), eq(tasks.workspaceId, m.workspaceId));

  // Work handed to me: open tasks someone else assigned (admin → researcher, reviewer → SDR, …)
  if (can("view_tasks")) {
    const mine = await db
      .select({ createdAt: tasks.createdAt, dueAt: tasks.dueAt, type: tasks.type, createdBy: tasks.createdBy })
      .from(tasks)
      .where(and(ws, eq(tasks.ownerUserId, m.userId), inArray(tasks.status, ["open", "in_progress"])));
    const assigned = mine.filter((t) => t.createdBy !== m.userId);
    if (assigned.length) {
      const research = assigned.filter((t) => t.type === "research").length;
      items.push({
        key: "tasks_assigned",
        kind: "tasks",
        label: assigned.length === 1 ? "A task was assigned to you" : `${assigned.length} tasks assigned to you`,
        detail: research ? `${research} research lead${research === 1 ? "" : "s"} to qualify` : null,
        href: research && can("submit_review") ? "/accounts/qualify" : "/outreach/work",
        count: assigned.length,
        times: timesOf(assigned.map((t) => t.createdAt)),
      });
    }
    const now = Date.now();
    const overdue = mine.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now);
    if (overdue.length) {
      items.push({
        key: "tasks_overdue",
        kind: "tasks",
        label: `${overdue.length} of your tasks ${overdue.length === 1 ? "is" : "are"} overdue`,
        detail: null,
        href: "/outreach/tasks",
        count: overdue.length,
        times: timesOf(overdue.map((t) => t.dueAt)),
      });
    }
  }

  // Reviewers: briefs researchers sent for review
  if (can("accept")) {
    const waiting = await db
      .select({ updatedAt: accounts.updatedAt })
      .from(accounts)
      .where(and(accountScope(m), eq(accounts.acceptanceState, "ready_for_review")));
    if (waiting.length) {
      items.push({
        key: "review_waiting",
        kind: "review",
        label: `${waiting.length} brief${waiting.length === 1 ? "" : "s"} waiting for your review`,
        detail: null,
        href: "/accounts/review",
        count: waiting.length,
        times: timesOf(waiting.map((a) => a.updatedAt)),
      });
    }
  }

  // Researchers: what the reviewer decided on briefs I sent
  if (can("submit_review") && !can("accept")) {
    const sentByMe = db
      .select({ accountId: acceptanceDecisions.accountId })
      .from(acceptanceDecisions)
      .where(
        and(
          eq(acceptanceDecisions.workspaceId, m.workspaceId),
          eq(acceptanceDecisions.actorUserId, m.userId),
          eq(acceptanceDecisions.toState, "ready_for_review"),
        ),
      );
    const decisions = await db
      .select({ toState: acceptanceDecisions.toState, createdAt: acceptanceDecisions.createdAt })
      .from(acceptanceDecisions)
      .where(
        and(
          eq(acceptanceDecisions.workspaceId, m.workspaceId),
          inArray(acceptanceDecisions.toState, ["accepted", "rejected", "needs_research"]),
          ne(acceptanceDecisions.actorUserId, m.userId),
          gte(acceptanceDecisions.createdAt, since),
          inArray(acceptanceDecisions.accountId, sentByMe),
        ),
      );
    const returned = decisions.filter((d) => d.toState === "needs_research");
    const decided = decisions.filter((d) => d.toState !== "needs_research");
    if (returned.length) {
      items.push({
        key: "briefs_returned",
        kind: "returned",
        label: `${returned.length} brief${returned.length === 1 ? " was" : "s were"} returned to you`,
        detail: "The reviewer asked for more research",
        href: "/accounts/qualify",
        count: returned.length,
        times: timesOf(returned.map((d) => d.createdAt)),
      });
    }
    if (decided.length) {
      const accepted = decided.filter((d) => d.toState === "accepted").length;
      items.push({
        key: "briefs_decided",
        kind: "decided",
        label: `${decided.length} of your brief${decided.length === 1 ? "" : "s"} got a decision`,
        detail: `${accepted} accepted, ${decided.length - accepted} rejected`,
        href: "/accounts/qualify",
        count: decided.length,
        times: timesOf(decided.map((d) => d.createdAt)),
      });
    }
  }

  // Partners: accounts shared with me that I haven't answered yet
  if (can("acknowledge_handoff") && !can("view_accounts")) {
    const shared = await db
      .select({ sharedAt: handoffs.sharedAt })
      .from(handoffAccess)
      .innerJoin(handoffs, eq(handoffAccess.handoffId, handoffs.id))
      .where(
        and(
          eq(handoffAccess.workspaceId, m.workspaceId),
          eq(handoffAccess.granteeEmail, email.toLowerCase()),
          isNull(handoffAccess.revokedAt),
          eq(handoffs.state, "shared"),
        ),
      );
    if (shared.length) {
      items.push({
        key: "handoffs_shared",
        kind: "shared",
        label: `${shared.length} account${shared.length === 1 ? " was" : "s were"} shared with you`,
        detail: "Acknowledge or return each one",
        href: "/shared",
        count: shared.length,
        times: timesOf(shared.map((h) => h.sharedAt)),
      });
    }
  }

  // Reviewers / admins: partners acknowledged or returned a handoff
  if (can("handoff")) {
    const replies = await db
      .select({ action: auditEvents.action, createdAt: auditEvents.createdAt, accountId: handoffs.accountId })
      .from(auditEvents)
      .innerJoin(handoffs, eq(auditEvents.entityId, handoffs.id))
      .where(
        and(
          eq(auditEvents.tenantId, m.tenantId),
          eq(auditEvents.workspaceId, m.workspaceId),
          inArray(auditEvents.action, ["handoff.acknowledged", "handoff.returned"]),
          gte(auditEvents.createdAt, since),
        ),
      )
      .orderBy(desc(auditEvents.createdAt));
    if (replies.length) {
      const returnedCount = replies.filter((r) => r.action === "handoff.returned").length;
      items.push({
        key: "handoff_replies",
        kind: "handoff_reply",
        label: `${replies.length} partner repl${replies.length === 1 ? "y" : "ies"} to handoffs`,
        detail: `${replies.length - returnedCount} acknowledged, ${returnedCount} returned`,
        // Open the account of the newest reply, where the handoff panel shows the details
        href: `/accounts/detail?id=${replies[0]!.accountId}`,
        count: replies.length,
        times: timesOf(replies.map((r) => r.createdAt)),
      });
    }
  }

  // Monitors found new changes
  if (can("view_accounts") && can("discover")) {
    const changes = await db
      .select({ discoveredAt: changeEvents.discoveredAt, accountId: changeEvents.accountId })
      .from(changeEvents)
      .where(and(eq(changeEvents.tenantId, m.tenantId), eq(changeEvents.workspaceId, m.workspaceId), gte(changeEvents.discoveredAt, since), eq(changeEvents.material, true)));
    if (changes.length) {
      const onAccounts = changes.filter((c) => c.accountId).length;
      items.push({
        key: "monitor_changes",
        kind: "changes",
        label: `${changes.length} new change${changes.length === 1 ? "" : "s"} found by monitors`,
        detail: onAccounts ? `${onAccounts} about your accounts` : null,
        href: "/accounts/monitors",
        count: changes.length,
        times: timesOf(changes.map((c) => c.discoveredAt)),
      });
    }
  }

  // Analysts: newly accepted briefs (the result they report on)
  if (can("view_reports") && !can("view_accounts")) {
    const accepted = await db
      .select({ createdAt: acceptanceDecisions.createdAt })
      .from(acceptanceDecisions)
      .where(
        and(
          eq(acceptanceDecisions.tenantId, m.tenantId),
          eq(acceptanceDecisions.workspaceId, m.workspaceId),
          eq(acceptanceDecisions.toState, "accepted"),
          gte(acceptanceDecisions.createdAt, since),
        ),
      );
    if (accepted.length) {
      items.push({
        key: "accepted_recent",
        kind: "accepted",
        label: `${accepted.length} brief${accepted.length === 1 ? "" : "s"} accepted in the last ${RECENT_DAYS} days`,
        detail: "See the outcomes report",
        href: "/reports/outcomes",
        count: accepted.length,
        times: timesOf(accepted.map((d) => d.createdAt)),
      });
    }
  }

  return items;
}
