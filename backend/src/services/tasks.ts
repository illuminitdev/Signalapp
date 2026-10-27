import { and, asc, eq, inArray, isNotNull, lt, notInArray, type SQL } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { activities, tasks, type TaskStatus, type TaskType } from "../db/schema/index.js";
import { conflict, notFound, validationError } from "../utils/errors.js";
import { newId } from "../utils/ids.js";
import { isAccountSuppressed } from "./suppressions.js";
import { isActiveMember } from "../middleware/requireMembership.js";
import { writeAudit } from "./audit.js";

export const taskPriorities = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

/** Allowed status transitions (R6). Completed and Cancelled are terminal. */
const transitions: Record<TaskStatus, TaskStatus[]> = {
  open: ["in_progress", "completed", "cancelled"],
  in_progress: ["open", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function assertValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
  } catch {
    throw validationError(`Unknown timezone: ${tz}`);
  }
}

export async function createTask(input: {
  tenantId: string;
  workspaceId: string;
  accountId: string;
  type: TaskType;
  ownerUserId: string;
  dueAt?: string | null;
  timezone?: string;
  instruction?: string;
  priority?: TaskPriority;
  idempotencyKey?: string;
  createdBy: string;
  confirmFollowUp?: boolean;
}) {
  if (input.type === "follow_up" && !input.confirmFollowUp) {
    throw validationError("Proposed follow-up task requires confirmation");
  }
  if (!(await isActiveMember(input.workspaceId, input.ownerUserId))) {
    throw validationError("Task owner must be an active workspace member");
  }
  // Research and review tasks may be created before acceptance; contact tasks honor suppression (gate 8)
  if (input.type !== "research" && input.type !== "review" && (await isAccountSuppressed(input.workspaceId, input.accountId))) {
    throw validationError("Cannot create a contact task for a suppressed account");
  }
  const timezone = input.timezone ?? "UTC";
  assertValidTimezone(timezone);

  const db = getDb();
  if (input.idempotencyKey) {
    const existing = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, input.workspaceId),
          eq(tasks.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];
  }
  const id = newId("tsk");
  await db.insert(tasks).values({
    id,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    type: input.type,
    ownerUserId: input.ownerUserId,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    timezone,
    instruction: input.instruction,
    priority: input.priority ?? "normal",
    idempotencyKey: input.idempotencyKey,
    createdBy: input.createdBy,
  });
  await writeAudit({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorUserId: input.createdBy,
    action: "task.created",
    entityType: "task",
    entityId: id,
    metadata: { type: input.type, ownerUserId: input.ownerUserId },
  });
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row!;
}

export async function getTask(tenantId: string, workspaceId: string, taskId: string) {
  const db = getDb();
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.tenantId, tenantId)),
    )
    .limit(1);
  if (!task) throw notFound("Task not found");
  return task;
}

export async function updateTask(input: {
  tenantId: string;
  workspaceId: string;
  taskId: string;
  status?: TaskStatus;
  outcome?: string;
  cancelReason?: string;
  ownerUserId?: string;
  dueAt?: string | null;
  priority?: TaskPriority;
  actorUserId: string;
}) {
  const db = getDb();
  const task = await getTask(input.tenantId, input.workspaceId, input.taskId);

  if (input.status && input.status !== task.status) {
    if (!transitions[task.status].includes(input.status)) {
      throw conflict(`Invalid task transition ${task.status} → ${input.status}`);
    }
    if (input.status === "completed" && !input.outcome?.trim()) {
      throw validationError("Completion requires an outcome");
    }
    if (input.status === "cancelled" && !input.cancelReason?.trim()) {
      throw validationError("Cancellation requires a reason");
    }
  } else if (task.status === "completed" || task.status === "cancelled") {
    throw conflict("Completed or cancelled tasks cannot be edited");
  }
  if (input.ownerUserId && !(await isActiveMember(input.workspaceId, input.ownerUserId))) {
    throw validationError("Task owner must be an active workspace member");
  }

  const updated = await db
    .update(tasks)
    .set({
      status: input.status ?? task.status,
      outcome: input.status === "completed" ? input.outcome : task.outcome,
      cancelReason: input.status === "cancelled" ? input.cancelReason : task.cancelReason,
      ownerUserId: input.ownerUserId ?? task.ownerUserId,
      dueAt: input.dueAt === undefined ? task.dueAt : input.dueAt ? new Date(input.dueAt) : null,
      priority: input.priority ?? task.priority,
      updatedAt: new Date(),
    })
    // Guard against a concurrent transition from the same starting state
    .where(and(eq(tasks.id, task.id), eq(tasks.status, task.status)))
    .returning({ id: tasks.id });
  if (!updated[0]) throw conflict("Task changed concurrently — reload and retry");

  if (input.status === "completed" || input.status === "cancelled") {
    await db.insert(activities).values({
      id: newId("act"),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      accountId: task.accountId,
      taskId: task.id,
      kind: input.status === "completed" ? "task_completed" : "task_cancelled",
      note: input.status === "completed" ? input.outcome : input.cancelReason,
      actorUserId: input.actorUserId,
    });
  }

  // Explicit: task completion does not update opportunity stage, send messages,
  // or create attended meetings — activity record only (gate 7).
  const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id)).limit(1);
  return row!;
}

export async function listTasks(
  tenantId: string,
  workspaceId: string,
  filters: {
    ownerUserId?: string;
    /** "active" = open or in progress, so a started task stays in the default queue */
    status?: TaskStatus | "active";
    priority?: TaskPriority;
    accountId?: string;
    due?: "overdue" | "today" | "week";
  } = {},
) {
  const db = getDb();
  const where: SQL[] = [eq(tasks.workspaceId, workspaceId), eq(tasks.tenantId, tenantId)];
  if (filters.ownerUserId) where.push(eq(tasks.ownerUserId, filters.ownerUserId));
  if (filters.status === "active") where.push(inArray(tasks.status, ["open", "in_progress"]));
  else if (filters.status) where.push(eq(tasks.status, filters.status));
  if (filters.priority) where.push(eq(tasks.priority, filters.priority));
  if (filters.accountId) where.push(eq(tasks.accountId, filters.accountId));
  if (filters.due) {
    const now = new Date();
    const horizon =
      filters.due === "overdue"
        ? now
        : new Date(now.getTime() + (filters.due === "today" ? 1 : 7) * 86400000);
    where.push(isNotNull(tasks.dueAt), lt(tasks.dueAt, horizon));
    where.push(notInArray(tasks.status, ["completed", "cancelled"]));
  }
  return db
    .select()
    .from(tasks)
    .where(and(...where))
    .orderBy(asc(tasks.dueAt));
}
