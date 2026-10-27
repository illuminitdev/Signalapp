import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { accounts, evidence } from "../db/schema/index.js";
import type { MembershipRole } from "../db/schema/identity.js";
import { forbidden, notFound, validationError } from "../utils/errors.js";
import { isActiveMember } from "../middleware/requireMembership.js";
import { transitionAcceptance } from "./acceptance.js";
import { getOrCreateQualification, updateQualification } from "./qualification.js";
import { createTask, getTask, updateTask } from "./tasks.js";

/**
 * One-step hand-off for a research task: save the researcher's note as the rationale,
 * submit the account for review, give the reviewer a Sales review task and complete
 * the research task. Each step is skipped if it already happened, so a retry after a
 * partial failure finishes the job instead of duplicating it.
 */
export async function sendResearchForReview(input: {
  tenantId: string;
  workspaceId: string;
  taskId: string;
  note: string;
  reviewerUserId: string;
  actorUserId: string;
  role: MembershipRole;
}) {
  const note = input.note.trim();
  if (!note) throw validationError("Write a short note for the reviewer");

  const task = await getTask(input.tenantId, input.workspaceId, input.taskId);
  if (task.type !== "research") throw validationError("Only research tasks can be sent for review");
  if (input.role !== "tenant_admin" && task.ownerUserId !== input.actorUserId) {
    throw forbidden("You can only send your own tasks for review");
  }
  if (task.status === "completed" || task.status === "cancelled") {
    throw validationError("This task is already finished");
  }
  if (!(await isActiveMember(input.workspaceId, input.reviewerUserId))) {
    throw validationError("Reviewer must be an active workspace member");
  }

  const db = getDb();
  // The reviewer can only accept with reviewed evidence, so require it before handing over
  const reviewed = await db
    .select({ id: evidence.id })
    .from(evidence)
    .where(
      and(
        eq(evidence.accountId, task.accountId),
        eq(evidence.workspaceId, input.workspaceId),
        isNotNull(evidence.reviewedAt),
      ),
    )
    .limit(1);
  if (!reviewed[0]) {
    throw validationError("Mark at least one evidence item as reviewed on the account brief first");
  }

  const qual = await getOrCreateQualification(input.tenantId, input.workspaceId, task.accountId);
  if (qual.rationale !== note) {
    await updateQualification({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      accountId: task.accountId,
      expectedVersion: qual.version,
      rationale: note,
      actorUserId: input.actorUserId,
    });
  }

  const [account] = await db
    .select({ acceptanceState: accounts.acceptanceState })
    .from(accounts)
    .where(and(eq(accounts.id, task.accountId), eq(accounts.workspaceId, input.workspaceId)))
    .limit(1);
  if (!account) throw notFound("Account not found");
  if (account.acceptanceState === "draft" || account.acceptanceState === "needs_research") {
    await transitionAcceptance({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      accountId: task.accountId,
      toState: "ready_for_review",
      actorUserId: input.actorUserId,
      role: input.role,
    });
  } else if (account.acceptanceState !== "ready_for_review") {
    throw validationError(`This account is already ${account.acceptanceState.replace(/_/g, " ")}`);
  }

  const reviewTask = await createTask({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    accountId: task.accountId,
    type: "review",
    ownerUserId: input.reviewerUserId,
    timezone: task.timezone,
    instruction: note,
    priority: task.priority as "low" | "normal" | "high" | "urgent",
    idempotencyKey: `handoff-${task.id}`,
    createdBy: input.actorUserId,
  });

  const researchTask = await updateTask({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    taskId: task.id,
    status: "completed",
    outcome: `Sent to sales review: ${note}`,
    actorUserId: input.actorUserId,
  });

  return { researchTask, reviewTask };
}
