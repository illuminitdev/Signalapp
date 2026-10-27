import type { FastifyInstance } from "fastify";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import {
  accounts,
  memberships,
  membershipRoles,
  workspaces,
  type MembershipRole,
} from "../../db/schema/index.js";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { loadMembership, requireCap, type MembershipContext } from "../../middleware/requireMembership.js";
import { grantMembership, listMemberships, revokeMembership } from "../../services/memberships.js";
import { provisionWorkspace } from "../../services/tenants.js";
import { writeAudit } from "../../services/audit.js";
import { notFound } from "../../utils/errors.js";

const roleSchema = z.enum(membershipRoles as unknown as [MembershipRole, ...MembershipRole[]]);

/** The caller's tenant admin membership in the workspace they are working in. */
async function tenantAdmin(req: Parameters<typeof loadMembership>[0]) {
  const { workspaceId } = req.params as { workspaceId: string };
  const m = await loadMembership(req, workspaceId);
  requireCap(m, "manage_membership");
  return m;
}

/** A workspace of the caller's own company; any other id is reported as missing. */
async function companyWorkspace(m: MembershipContext, targetId: string) {
  const [ws] = await getDb()
    .select({ id: workspaces.id, name: workspaces.name, currency: workspaces.currency, createdAt: workspaces.createdAt })
    .from(workspaces)
    .where(and(eq(workspaces.id, targetId), eq(workspaces.tenantId, m.tenantId)))
    .limit(1);
  if (!ws) throw notFound("Workspace not found");
  return ws;
}

/**
 * Tenant admin's company view: every workspace of their tenant and who is in it.
 * Scoped by the tenant of the workspace the request comes from, never across tenants.
 */
export async function companyWorkspaceRoutes(app: FastifyInstance) {
  app.get("/v1/workspaces/:workspaceId/company/workspaces", { preHandler: authenticateRequired }, async (req) => {
    const m = await tenantAdmin(req);
    const db = getDb();
    const [rows, roleCounts, accountCounts, mine] = await Promise.all([
      db
        .select({ id: workspaces.id, name: workspaces.name, currency: workspaces.currency, createdAt: workspaces.createdAt })
        .from(workspaces)
        .where(eq(workspaces.tenantId, m.tenantId))
        .orderBy(workspaces.createdAt),
      db
        .select({ workspaceId: memberships.workspaceId, role: memberships.role, n: count() })
        .from(memberships)
        .where(and(eq(memberships.tenantId, m.tenantId), isNull(memberships.revokedAt)))
        .groupBy(memberships.workspaceId, memberships.role),
      db
        .select({ workspaceId: accounts.workspaceId, n: count() })
        .from(accounts)
        // Same records as the watchlist: duplicates merged into another account are left out
        .where(and(eq(accounts.tenantId, m.tenantId), isNull(accounts.mergedIntoId)))
        .groupBy(accounts.workspaceId),
      db
        .select({ workspaceId: memberships.workspaceId })
        .from(memberships)
        .where(and(eq(memberships.userId, m.userId), eq(memberships.tenantId, m.tenantId), isNull(memberships.revokedAt))),
    ]);
    const accs = new Map(accountCounts.map((r) => [r.workspaceId, Number(r.n)]));
    const joined = new Set(mine.map((r) => r.workspaceId));

    return {
      workspaces: rows.map((w) => {
        const membersByRole: Record<string, number> = {};
        for (const r of roleCounts) if (r.workspaceId === w.id) membersByRole[r.role] = Number(r.n);
        return {
          ...w,
          members: Object.values(membersByRole).reduce((a, b) => a + b, 0),
          membersByRole,
          accounts: accs.get(w.id) ?? 0,
          isMember: joined.has(w.id),
        };
      }),
    };
  });

  /** New empty workspace; every tenant admin of the company gets admin access to it. */
  app.post("/v1/workspaces/:workspaceId/company/workspaces", { preHandler: authenticateRequired }, async (req) => {
    const m = await tenantAdmin(req);
    const body = z.object({ name: z.string().trim().min(1, "Workspace name is required").max(200) }).parse(req.body);
    const created = await provisionWorkspace({ tenantId: m.tenantId, name: body.name, actorUserId: m.userId });
    await writeAudit({
      tenantId: m.tenantId,
      workspaceId: created.workspaceId,
      actorUserId: m.userId,
      action: "workspace.created",
      entityType: "workspace",
      entityId: created.workspaceId,
      metadata: { name: body.name, adminEmails: created.adminEmails },
    });
    return created;
  });

  app.get(
    "/v1/workspaces/:workspaceId/company/workspaces/:targetId/members",
    { preHandler: authenticateRequired },
    async (req) => {
      const m = await tenantAdmin(req);
      const { targetId } = req.params as { targetId: string };
      const workspace = await companyWorkspace(m, targetId);
      return { workspace, memberships: await listMemberships(targetId) };
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/company/workspaces/:targetId/members",
    { preHandler: authenticateRequired },
    async (req) => {
      const m = await tenantAdmin(req);
      const { targetId } = req.params as { targetId: string };
      await companyWorkspace(m, targetId);
      const body = z
        .object({
          email: z.string().email(),
          name: z.string().optional(),
          role: roleSchema,
          password: z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
        })
        .parse(req.body);
      return grantMembership({ tenantId: m.tenantId, workspaceId: targetId, ...body, actorUserId: m.userId });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/company/workspaces/:targetId/members/:membershipId/revoke",
    { preHandler: authenticateRequired },
    async (req) => {
      const m = await tenantAdmin(req);
      const { targetId, membershipId } = req.params as { targetId: string; membershipId: string };
      const membership = await revokeMembership({
        tenantId: m.tenantId,
        workspaceId: targetId,
        membershipId,
        actorUserId: m.userId,
      });
      return { membership };
    },
  );
}
