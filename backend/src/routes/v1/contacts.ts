import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buyingRoles, contactSourceTypes } from "../../db/schema/index.js";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { assertAccountReadable, loadMembership, requireCap } from "../../middleware/requireMembership.js";
import {
  createContact,
  createRoleHypothesis,
  deleteContact,
  deleteRoleHypothesis,
  linkRoleHypothesis,
  listPeople,
} from "../../services/contacts.js";

const wsQuery = z.object({ workspaceId: z.string() });

export async function contactRoutes(app: FastifyInstance) {
  /** Sourced contacts and role hypotheses for one account, kept as separate lists. */
  app.get("/v1/accounts/:accountId/contacts", { preHandler: authenticateRequired }, async (req) => {
    const { accountId } = req.params as { accountId: string };
    const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
    await assertAccountReadable(m, accountId);
    return listPeople({ tenantId: m.tenantId, workspaceId: m.workspaceId, accountId });
  });

  app.post("/v1/accounts/:accountId/contacts", { preHandler: authenticateRequired }, async (req) => {
    const { accountId } = req.params as { accountId: string };
    const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
    requireCap(m, "qualify");
    await assertAccountReadable(m, accountId);
    const body = z
      .object({
        name: z.string().trim().min(1, "Name is required").max(200),
        title: z.string().max(200).nullable().optional(),
        buyingRole: z.enum(buyingRoles).default("unknown"),
        email: z.string().trim().email("Enter a valid email").max(320).nullable().optional().or(z.literal("")),
        phone: z.string().max(50).nullable().optional(),
        sourceType: z.enum(contactSourceTypes),
        evidenceId: z.string().nullable().optional(),
        sourceNote: z.string().max(1000).nullable().optional(),
      })
      .parse(req.body);
    const contact = await createContact({
      tenantId: m.tenantId,
      workspaceId: m.workspaceId,
      accountId,
      actorUserId: req.actor!.userId,
      ...body,
      email: body.email || null,
    });
    return { contact };
  });

  app.delete("/v1/accounts/:accountId/contacts/:contactId", { preHandler: authenticateRequired }, async (req) => {
    const { accountId, contactId } = req.params as { accountId: string; contactId: string };
    const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
    requireCap(m, "qualify");
    await assertAccountReadable(m, accountId);
    await deleteContact({ tenantId: m.tenantId, workspaceId: m.workspaceId, accountId, contactId, actorUserId: req.actor!.userId });
    return { ok: true };
  });

  app.post("/v1/accounts/:accountId/role-hypotheses", { preHandler: authenticateRequired }, async (req) => {
    const { accountId } = req.params as { accountId: string };
    const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
    requireCap(m, "qualify");
    await assertAccountReadable(m, accountId);
    const body = z
      .object({
        roleTitle: z.string().trim().min(1, "Role is required").max(200),
        buyingRole: z.enum(buyingRoles).default("unknown"),
        rationale: z.string().trim().min(1, "Say why you think this role matters").max(2000),
        evidenceIds: z.array(z.string()).max(20).default([]),
      })
      .parse(req.body);
    const roleHypothesis = await createRoleHypothesis({
      tenantId: m.tenantId,
      workspaceId: m.workspaceId,
      accountId,
      actorUserId: req.actor!.userId,
      ...body,
    });
    return { roleHypothesis };
  });

  app.patch(
    "/v1/accounts/:accountId/role-hypotheses/:hypothesisId",
    { preHandler: authenticateRequired },
    async (req) => {
      const { accountId, hypothesisId } = req.params as { accountId: string; hypothesisId: string };
      const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
      requireCap(m, "qualify");
      await assertAccountReadable(m, accountId);
      const body = z.object({ contactId: z.string().nullable() }).parse(req.body);
      const roleHypothesis = await linkRoleHypothesis({
        tenantId: m.tenantId,
        workspaceId: m.workspaceId,
        accountId,
        hypothesisId,
        contactId: body.contactId,
        actorUserId: req.actor!.userId,
      });
      return { roleHypothesis };
    },
  );

  app.delete(
    "/v1/accounts/:accountId/role-hypotheses/:hypothesisId",
    { preHandler: authenticateRequired },
    async (req) => {
      const { accountId, hypothesisId } = req.params as { accountId: string; hypothesisId: string };
      const m = await loadMembership(req, wsQuery.parse(req.query).workspaceId);
      requireCap(m, "qualify");
      await assertAccountReadable(m, accountId);
      await deleteRoleHypothesis({
        tenantId: m.tenantId,
        workspaceId: m.workspaceId,
        accountId,
        hypothesisId,
        actorUserId: req.actor!.userId,
      });
      return { ok: true };
    },
  );
}
