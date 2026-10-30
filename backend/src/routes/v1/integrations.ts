import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enqueueCrmSync } from "../../jobs/crmQueue.js";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { assertAccountReadable, loadMembership, requireCap } from "../../middleware/requireMembership.js";
import { crmProviderStatus } from "../../providers/crm/index.js";
import { getSyncStatus, previewSync, requestSync } from "../../services/crmSync.js";
import { ensureEntitlements } from "../../services/entitlements.js";

const wsQuery = z.object({ workspaceId: z.string() });

/** CRM integration (spec R8, §8 "POST /v1/integrations/{id}/sync"): scoped, previewable, idempotent. */
export async function integrationRoutes(app: FastifyInstance) {
  app.get("/v1/workspaces/:workspaceId/integrations", { preHandler: authenticateRequired }, async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const m = await loadMembership(req, workspaceId);
    requireCap(m, "view_accounts");
    const e = await ensureEntitlements(m.tenantId, workspaceId);
    return { crm: { ...crmProviderStatus(), enabled: e.crmEnabled } };
  });

  app.get("/v1/accounts/:accountId/crm", { preHandler: authenticateRequired }, async (req) => {
    const { accountId } = req.params as { accountId: string };
    const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
    await assertAccountReadable(m, accountId);
    return getSyncStatus({ tenantId: m.tenantId, workspaceId: m.workspaceId, accountId });
  });

  /** Dry run: what a sync would create, update, link or skip. Writes nothing to the CRM. */
  app.post("/v1/accounts/:accountId/crm/preview", { preHandler: authenticateRequired }, async (req) => {
    const { accountId } = req.params as { accountId: string };
    const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
    requireCap(m, "manage_integrations");
    await assertAccountReadable(m, accountId);
    return previewSync({ tenantId: m.tenantId, workspaceId: m.workspaceId, accountId });
  });

  app.post("/v1/accounts/:accountId/crm/sync", { preHandler: authenticateRequired }, async (req) => {
    const { accountId } = req.params as { accountId: string };
    const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
    requireCap(m, "manage_integrations");
    await assertAccountReadable(m, accountId);
    const job = { tenantId: m.tenantId, workspaceId: m.workspaceId, accountId, actorUserId: req.actor!.userId };
    await requestSync(job);
    await enqueueCrmSync(job);
    return getSyncStatus(job);
  });
}
