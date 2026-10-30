import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { opportunityStages } from "../../db/schema/index.js";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { assertAccountReadable, loadMembership, requireCap } from "../../middleware/requireMembership.js";
import { getOpportunity, saveOpportunity } from "../../services/opportunities.js";

export async function opportunityRoutes(app: FastifyInstance) {
  app.get("/v1/accounts/:accountId/opportunity", { preHandler: authenticateRequired }, async (req) => {
    const { accountId } = req.params as { accountId: string };
    const q = z.object({ workspaceId: z.string() }).parse(req.query);
    const m = await loadMembership(req, q.workspaceId);
    await assertAccountReadable(m, accountId);
    return { opportunity: await getOpportunity(m.tenantId, m.workspaceId, accountId) };
  });

  /** Create or update the account's deal stage and value. Acceptance state is untouched. */
  app.put("/v1/accounts/:accountId/opportunity", { preHandler: authenticateRequired }, async (req) => {
    const { accountId } = req.params as { accountId: string };
    const q = z.object({ workspaceId: z.string() }).parse(req.query);
    const m = await loadMembership(req, q.workspaceId);
    requireCap(m, "manage_pipeline");
    await assertAccountReadable(m, accountId);
    const body = z
      .object({
        expectedVersion: z.number().int().positive().optional(),
        stage: z.enum(opportunityStages),
        valueAmount: z.number().int().nonnegative().max(1_000_000_000_000).nullable(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, e.g. GBP")
          .optional(),
        lostReason: z.string().max(500).nullable().optional(),
        note: z.string().max(2000).nullable().optional(),
      })
      .parse(req.body);
    const opportunity = await saveOpportunity({
      tenantId: m.tenantId,
      workspaceId: m.workspaceId,
      accountId,
      actorUserId: req.actor!.userId,
      ...body,
    });
    return { opportunity };
  });
}
