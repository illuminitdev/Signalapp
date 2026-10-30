import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { loadMembership, requireCap } from "../../middleware/requireMembership.js";
import {
  createMonitorFromPlaybook,
  deleteMonitor,
  listChangeEvents,
  listMonitors,
  runMonitorCheck,
  updateMonitor,
} from "../../services/monitors.js";

const updateMonitorSchema = z.object({
  cadenceHours: z.number().int().positive().optional(),
  status: z.enum(["active", "paused"]).optional(),
});

export async function monitorsRoutes(app: FastifyInstance) {
  // List monitors for workspace
  app.get(
    "/v1/workspaces/:workspaceId/monitors",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "view_accounts");
      const monitors = await listMonitors(workspaceId);
      return { monitors };
    },
  );

  // Create monitor from active playbook
  app.post(
    "/v1/workspaces/:workspaceId/monitors/from-playbook",
    { preHandler: authenticateRequired },
    async (req, reply) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "discover");
      const monitor = await createMonitorFromPlaybook(workspaceId, m.userId);
      reply.status(201);
      return { monitor };
    },
  );

  // Update cadence or active/paused status
  app.patch(
    "/v1/workspaces/:workspaceId/monitors/:monitorId",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId, monitorId } = req.params as { workspaceId: string; monitorId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "discover");
      const body = updateMonitorSchema.parse(req.body ?? {});
      const monitor = await updateMonitor(workspaceId, monitorId, body);
      return { monitor };
    },
  );

  // Delete monitor
  app.delete(
    "/v1/workspaces/:workspaceId/monitors/:monitorId",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId, monitorId } = req.params as { workspaceId: string; monitorId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "discover");
      await deleteMonitor(workspaceId, monitorId);
      return { success: true };
    },
  );

  // Run a live check now (same rules as the scheduled run: budget, kill switch, suppression)
  app.post(
    "/v1/workspaces/:workspaceId/monitors/:monitorId/run",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId, monitorId } = req.params as { workspaceId: string; monitorId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "discover");
      const result = await runMonitorCheck(workspaceId, monitorId);
      return result;
    },
  );

  // List change events feed
  app.get(
    "/v1/workspaces/:workspaceId/monitors/changes",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const { monitorId } = (req.query ?? {}) as { monitorId?: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "view_accounts");
      const events = await listChangeEvents(workspaceId, monitorId);
      return { changeEvents: events };
    },
  );
}

