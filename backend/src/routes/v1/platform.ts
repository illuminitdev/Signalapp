import type { FastifyInstance } from "fastify";
import { and, count, countDistinct, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { accounts, memberships, tenants, users, workspaces } from "../../db/schema/index.js";
import { requirePlatformAdmin } from "../../middleware/authenticate.js";
import { provisionTenant, provisionWorkspace } from "../../services/tenants.js";
import { writeAudit } from "../../services/audit.js";
import { notFound } from "../../utils/errors.js";

/**
 * App-owner console. Returns counts only: a platform admin never reads a tenant's
 * accounts, evidence, briefs or member details (spec §4 tenant boundary). The one
 * exception is each company's tenant admin contact, on /v1/platform/users.
 */
export async function platformRoutes(app: FastifyInstance) {
  app.get("/v1/platform/overview", { preHandler: requirePlatformAdmin }, async () => {
    const db = getDb();
    const [tenantRows, wsCounts, memberCounts, accountCounts] = await Promise.all([
      db
        .select({
          id: tenants.id,
          name: tenants.name,
          researchQuotaMonthly: tenants.researchQuotaMonthly,
          researchUsedMonthly: tenants.researchUsedMonthly,
          createdAt: tenants.createdAt,
        })
        .from(tenants)
        .orderBy(tenants.createdAt),
      db.select({ tenantId: workspaces.tenantId, n: count() }).from(workspaces).groupBy(workspaces.tenantId),
      db
        .select({ tenantId: memberships.tenantId, role: memberships.role, n: countDistinct(memberships.userId) })
        .from(memberships)
        .where(isNull(memberships.revokedAt))
        .groupBy(memberships.tenantId, memberships.role),
      db.select({ tenantId: accounts.tenantId, n: count() }).from(accounts).groupBy(accounts.tenantId),
    ]);

    const byTenant = (rows: { tenantId: string; n: number }[]) => new Map(rows.map((r) => [r.tenantId, Number(r.n)]));
    const wsMap = byTenant(wsCounts);
    const accMap = byTenant(accountCounts);

    const companies = tenantRows.map((t) => {
      const roles: Record<string, number> = {};
      for (const m of memberCounts) if (m.tenantId === t.id) roles[m.role] = Number(m.n);
      return {
        ...t,
        workspaces: wsMap.get(t.id) ?? 0,
        members: Object.values(roles).reduce((a, b) => a + b, 0),
        membersByRole: roles,
        accounts: accMap.get(t.id) ?? 0,
      };
    });

    return {
      totals: {
        companies: companies.length,
        workspaces: companies.reduce((a, c) => a + c.workspaces, 0),
        members: companies.reduce((a, c) => a + c.members, 0),
        accounts: companies.reduce((a, c) => a + c.accounts, 0),
      },
      companies,
    };
  });

  /** Onboard a new customer company: tenant, first workspace and its tenant admin. */
  app.post("/v1/platform/tenants", { preHandler: requirePlatformAdmin }, async (req) => {
    const body = z
      .object({
        companyName: z.string().trim().min(1, "Company name is required").max(200),
        workspaceName: z.string().trim().max(200).optional(),
        adminEmail: z.string().trim().email("Enter a valid admin email"),
        adminName: z.string().trim().max(200).optional(),
        adminPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
      })
      .parse(req.body);

    const created = await provisionTenant({
      tenantName: body.companyName,
      workspaceName: body.workspaceName || "Default Workspace",
      adminEmail: body.adminEmail,
      adminName: body.adminName,
      adminPassword: body.adminPassword,
    });
    await writeAudit({
      tenantId: created.tenantId,
      workspaceId: created.workspaceId,
      actorUserId: req.actor!.userId,
      action: "tenant.created_by_platform_admin",
      entityType: "tenant",
      entityId: created.tenantId,
      metadata: { adminEmail: created.email },
    });
    return { tenantId: created.tenantId, adminEmail: created.email };
  });

  /** Reset a company's research usage for the current month back to 0 units. */
  app.post("/v1/platform/tenants/:tenantId/reset-research", { preHandler: requirePlatformAdmin }, async (req) => {
    const { tenantId } = req.params as { tenantId: string };
    const db = getDb();
    const [before] = await db
      .select({ used: tenants.researchUsedMonthly })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!before) throw notFound("Company not found");

    const [after] = await db
      .update(tenants)
      .set({ researchUsedMonthly: 0 })
      .where(eq(tenants.id, tenantId))
      .returning({ researchUsedMonthly: tenants.researchUsedMonthly, researchQuotaMonthly: tenants.researchQuotaMonthly });
    await writeAudit({
      tenantId,
      actorUserId: req.actor!.userId,
      action: "tenant.research_usage_reset_by_platform_admin",
      entityType: "tenant",
      entityId: tenantId,
      metadata: { previousUsed: before.used },
    });
    return after;
  });

  /** Every workspace across all companies, with counts only. */
  app.get("/v1/platform/workspaces", { preHandler: requirePlatformAdmin }, async () => {
    const db = getDb();
    const [rows, memberCounts, accountCounts] = await Promise.all([
      db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          tenantId: workspaces.tenantId,
          companyName: tenants.name,
          createdAt: workspaces.createdAt,
        })
        .from(workspaces)
        .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
        .orderBy(tenants.name, workspaces.createdAt),
      db
        .select({ workspaceId: memberships.workspaceId, n: count() })
        .from(memberships)
        .where(isNull(memberships.revokedAt))
        .groupBy(memberships.workspaceId),
      db.select({ workspaceId: accounts.workspaceId, n: count() }).from(accounts).groupBy(accounts.workspaceId),
    ]);
    const members = new Map(memberCounts.map((r) => [r.workspaceId, Number(r.n)]));
    const accs = new Map(accountCounts.map((r) => [r.workspaceId, Number(r.n)]));
    return {
      workspaces: rows.map((w) => ({ ...w, members: members.get(w.id) ?? 0, accounts: accs.get(w.id) ?? 0 })),
    };
  });

  /**
   * Users per company: head counts by role and workspace, plus the tenant admins'
   * names and emails (the people the platform admin onboards). Other members stay counts.
   */
  app.get("/v1/platform/users", { preHandler: requirePlatformAdmin }, async () => {
    const db = getDb();
    const [tenantRows, userCounts, roleCounts, wsRows, wsUserCounts, adminRows] = await Promise.all([
      db.select({ id: tenants.id, name: tenants.name, createdAt: tenants.createdAt }).from(tenants).orderBy(tenants.name),
      db
        .select({ tenantId: memberships.tenantId, n: countDistinct(memberships.userId) })
        .from(memberships)
        .where(isNull(memberships.revokedAt))
        .groupBy(memberships.tenantId),
      db
        .select({ tenantId: memberships.tenantId, role: memberships.role, n: countDistinct(memberships.userId) })
        .from(memberships)
        .where(isNull(memberships.revokedAt))
        .groupBy(memberships.tenantId, memberships.role),
      db
        .select({ id: workspaces.id, name: workspaces.name, tenantId: workspaces.tenantId })
        .from(workspaces)
        .orderBy(workspaces.createdAt),
      db
        .select({ workspaceId: memberships.workspaceId, n: count() })
        .from(memberships)
        .where(isNull(memberships.revokedAt))
        .groupBy(memberships.workspaceId),
      db
        .selectDistinct({ tenantId: memberships.tenantId, userId: users.id, name: users.name, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(and(eq(memberships.role, "tenant_admin"), isNull(memberships.revokedAt))),
    ]);
    const usersByTenant = new Map(userCounts.map((r) => [r.tenantId, Number(r.n)]));
    const usersByWs = new Map(wsUserCounts.map((r) => [r.workspaceId, Number(r.n)]));

    const companies = tenantRows.map((t) => {
      const usersByRole: Record<string, number> = {};
      for (const r of roleCounts) if (r.tenantId === t.id) usersByRole[r.role] = Number(r.n);
      const ws = wsRows.filter((w) => w.tenantId === t.id);
      return {
        ...t,
        users: usersByTenant.get(t.id) ?? 0,
        usersByRole,
        admins: adminRows.filter((a) => a.tenantId === t.id).map(({ userId, name, email }) => ({ userId, name, email })),
        workspaces: ws.map((w) => ({ id: w.id, name: w.name, users: usersByWs.get(w.id) ?? 0 })),
      };
    });

    return {
      totals: {
        users: companies.reduce((a, c) => a + c.users, 0),
        admins: new Set(adminRows.map((a) => a.userId)).size,
        companies: companies.length,
        workspaces: wsRows.length,
      },
      companies,
    };
  });

  /** Add an empty workspace to an existing company. */
  app.post("/v1/platform/workspaces", { preHandler: requirePlatformAdmin }, async (req) => {
    const body = z
      .object({
        tenantId: z.string().min(1, "Choose a company"),
        name: z.string().trim().min(1, "Workspace name is required").max(200),
        adminEmail: z.string().trim().email("Enter a valid admin email").optional(),
        adminName: z.string().trim().max(200).optional(),
        adminPassword: z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
      })
      .parse(req.body);

    const created = await provisionWorkspace({ ...body, actorUserId: req.actor!.userId });
    await writeAudit({
      tenantId: body.tenantId,
      workspaceId: created.workspaceId,
      actorUserId: req.actor!.userId,
      action: "workspace.created_by_platform_admin",
      entityType: "workspace",
      entityId: created.workspaceId,
      metadata: { name: body.name, adminEmails: created.adminEmails },
    });
    return created;
  });
}
