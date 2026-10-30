import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { loadMembership, requireCap } from "../../middleware/requireMembership.js";
import { computeOutcomes } from "../../services/outcomes.js";
import { computeRoleReport } from "../../services/roleReports.js";

export async function outcomeRoutes(app: FastifyInstance) {
  app.get(
    "/v1/workspaces/:workspaceId/outcomes",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "view_outcomes");
      const q = z
        .object({
          from: z.string().datetime({ offset: true }).optional(),
          to: z.string().datetime({ offset: true }).optional(),
        })
        .parse(req.query);
      const personal = await computeRoleReport(m, workspaceId, q.from, q.to);
      // SDR reads are scoped to their own work (spec §4), so they get no workspace-wide totals
      if (personal.view === "sdr") {
        const cohortFrom = q.from ? new Date(q.from) : new Date(Date.now() - 90 * 86400000);
        return {
          ...personal,
          cohort: {
            from: cohortFrom.toISOString(),
            to: (q.to ? new Date(q.to) : new Date()).toISOString(),
            dateBasis: "Event timestamp (task completion or cancellation) in UTC",
            decisionRule: "Your own tasks only",
          },
        };
      }
      return { ...(await computeOutcomes(m.tenantId, workspaceId, q.from, q.to)), ...personal };
    },
  );
}
