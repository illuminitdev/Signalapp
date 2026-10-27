import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateRequired } from "../../middleware/authenticate.js";
import {
  assertAccountReadable,
  loadMembership,
  requireCap,
} from "../../middleware/requireMembership.js";
import { createTask, getTask, listTasks, taskPriorities, updateTask } from "../../services/tasks.js";
import { sendResearchForReview } from "../../services/researchHandoff.js";
import { taskStatuses, taskTypes } from "../../db/schema/workflow.js";
import { forbidden } from "../../utils/errors.js";

export async function taskRoutes(app: FastifyInstance) {
  app.get(
    "/v1/workspaces/:workspaceId/tasks",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "view_tasks");
      const q = z
        .object({
          ownerUserId: z.string().optional(),
          status: z.enum([...taskStatuses, "active"]).optional(),
          priority: z.enum(taskPriorities).optional(),
          accountId: z.string().optional(),
          due: z.enum(["overdue", "today", "week"]).optional(),
        })
        .parse(req.query);
      // Only the tenant admin sees everyone's tasks; every other role works its own queue
      const ownerUserId = m.role === "tenant_admin" ? q.ownerUserId : m.userId;
      const tasks = await listTasks(m.tenantId, workspaceId, { ...q, ownerUserId });
      return { tasks };
    },
  );

  app.post("/v1/tasks", { preHandler: authenticateRequired }, async (req) => {
    const body = z
      .object({
        workspaceId: z.string(),
        accountId: z.string(),
        type: z.enum(taskTypes),
        ownerUserId: z.string(),
        dueAt: z.string().datetime({ offset: true }).optional(),
        timezone: z.string().optional(),
        instruction: z.string().max(2000).optional(),
        priority: z.enum(taskPriorities).optional(),
        idempotencyKey: z.string().max(200).optional(),
        confirmFollowUp: z.boolean().optional(),
      })
      .parse(req.body);

    const m = await loadMembership(req, body.workspaceId);
    requireCap(m, "tasks");
    await assertAccountReadable(m, body.accountId);

    const task = await createTask({
      tenantId: m.tenantId,
      workspaceId: m.workspaceId,
      accountId: body.accountId,
      type: body.type,
      ownerUserId: body.ownerUserId,
      dueAt: body.dueAt,
      timezone: body.timezone,
      instruction: body.instruction,
      priority: body.priority,
      idempotencyKey: body.idempotencyKey,
      createdBy: req.actor!.userId,
      confirmFollowUp: body.confirmFollowUp,
    });
    return { task };
  });

  app.post("/v1/tasks/:taskId/send-for-review", { preHandler: authenticateRequired }, async (req) => {
    const { taskId } = req.params as { taskId: string };
    const body = z
      .object({
        workspaceId: z.string(),
        note: z.string().min(1).max(2000),
        reviewerUserId: z.string(),
      })
      .parse(req.body);

    const m = await loadMembership(req, body.workspaceId);
    requireCap(m, "tasks");
    requireCap(m, "submit_review");
    const task = await getTask(m.tenantId, m.workspaceId, taskId);
    await assertAccountReadable(m, task.accountId);
    return sendResearchForReview({
      tenantId: m.tenantId,
      workspaceId: m.workspaceId,
      taskId,
      note: body.note,
      reviewerUserId: body.reviewerUserId,
      actorUserId: req.actor!.userId,
      role: m.role,
    });
  });

  app.patch("/v1/tasks/:taskId", { preHandler: authenticateRequired }, async (req) => {
    const { taskId } = req.params as { taskId: string };
    const body = z
      .object({
        workspaceId: z.string(),
        status: z.enum(taskStatuses).optional(),
        outcome: z.string().max(2000).optional(),
        cancelReason: z.string().max(2000).optional(),
        ownerUserId: z.string().optional(),
        dueAt: z.string().datetime({ offset: true }).nullable().optional(),
        priority: z.enum(taskPriorities).optional(),
      })
      .parse(req.body);

    const m = await loadMembership(req, body.workspaceId);
    requireCap(m, "tasks");
    const existing = await getTask(m.tenantId, m.workspaceId, taskId);
    if (m.role !== "tenant_admin" && existing.ownerUserId !== m.userId) {
      throw forbidden("You can only update your own tasks");
    }
    const task = await updateTask({
      tenantId: m.tenantId,
      workspaceId: m.workspaceId,
      taskId,
      status: body.status,
      outcome: body.outcome,
      cancelReason: body.cancelReason,
      ownerUserId: body.ownerUserId,
      dueAt: body.dueAt,
      priority: body.priority,
      actorUserId: req.actor!.userId,
    });
    return { task };
  });
}
