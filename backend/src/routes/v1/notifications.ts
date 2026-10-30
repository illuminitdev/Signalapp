import type { FastifyInstance } from "fastify";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { loadMembership } from "../../middleware/requireMembership.js";
import { notificationsFor } from "../../services/notifications.js";

export async function notificationRoutes(app: FastifyInstance) {
  /** The signed-in member's bell: only what their own role is allowed to see. */
  app.get("/v1/workspaces/:workspaceId/notifications", { preHandler: authenticateRequired }, async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const m = await loadMembership(req, workspaceId);
    return { items: await notificationsFor(m, req.actor!.email) };
  });
}
