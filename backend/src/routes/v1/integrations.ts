import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enqueueCrmSync } from "../../jobs/crmQueue.js";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { assertAccountReadable, loadMembership, requireCap } from "../../middleware/requireMembership.js";
import { crmProviderStatus } from "../../providers/crm/index.js";
import { getSyncStatus, previewSync, requestSync } from "../../services/crmSync.js";
import { ensureEntitlements } from "../../services/entitlements.js";
import { connectCrm, CRM_CATALOG, disconnectCrm, getConnectionView, testCrmConnection } from "../../services/crmConnections.js";
import { hasCapability } from "../../auth/permissions.js";
import { forbidden } from "../../utils/errors.js";

const wsQuery = z.object({ workspaceId: z.string() });

/** CRM integration (spec R8, §8 "POST /v1/integrations/{id}/sync"): scoped, previewable, idempotent. */
export async function integrationRoutes(app: FastifyInstance) {
  /** The company's CRM connection and the CRMs it could connect. Never includes the credential. */
  app.get("/v1/workspaces/:workspaceId/crm-connection", { preHandler: authenticateRequired }, async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const m = await loadMembership(req, workspaceId);
    if (!hasCapability(m.role, "manage_settings") && !hasCapability(m.role, "manage_integrations")) {
      throw forbidden("Missing capability: manage_settings");
    }
    return { connection: await getConnectionView(m.tenantId), catalog: CRM_CATALOG };
  });

  /** Connect or replace the company's CRM (tenant admin). The credential is verified before it's stored. */
  app.put("/v1/workspaces/:workspaceId/crm-connection", { preHandler: authenticateRequired }, async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const m = await loadMembership(req, workspaceId);
    requireCap(m, "manage_settings");
    const body = z.object({ provider: z.string(), credential: z.string().trim().min(10).max(2000) }).parse(req.body);
    return {
      connection: await connectCrm({ tenantId: m.tenantId, workspaceId, actorUserId: m.userId, provider: body.provider, credential: body.credential }),
    };
  });

  app.post("/v1/workspaces/:workspaceId/crm-connection/test", { preHandler: authenticateRequired }, async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const m = await loadMembership(req, workspaceId);
    if (!hasCapability(m.role, "manage_settings") && !hasCapability(m.role, "manage_integrations")) {
      throw forbidden("Missing capability: manage_settings");
    }
    return { connection: await testCrmConnection(m.tenantId) };
  });

  app.delete("/v1/workspaces/:workspaceId/crm-connection", { preHandler: authenticateRequired }, async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const m = await loadMembership(req, workspaceId);
    requireCap(m, "manage_settings");
    await disconnectCrm({ tenantId: m.tenantId, workspaceId, actorUserId: m.userId });
    return { connection: null };
  });

  app.get("/v1/workspaces/:workspaceId/integrations", { preHandler: authenticateRequired }, async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const m = await loadMembership(req, workspaceId);
    requireCap(m, "view_accounts");
    const e = await ensureEntitlements(m.tenantId, workspaceId);
    return { crm: { ...(await crmProviderStatus(m.tenantId)), enabled: e.crmEnabled } };
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
