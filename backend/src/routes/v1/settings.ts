import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { offers, playbookVersions, workspaces } from "../../db/schema/index.js";
import { authenticateRequired } from "../../middleware/authenticate.js";
import { loadMembership, requireCap } from "../../middleware/requireMembership.js";
import { hasCapability } from "../../auth/permissions.js";
import { getUsage } from "../../services/budget.js";
import { researchProviderStatus } from "../../providers/research/index.js";
import { crmProviderStatus } from "../../providers/crm/index.js";
import { newId } from "../../utils/ids.js";
import { forbidden, validationError } from "../../utils/errors.js";
import { writeAudit } from "../../services/audit.js";
import { ensureEntitlements, updateEntitlements } from "../../services/entitlements.js";
import { parseBrief } from "../../services/briefParser.js";
import { parseGates } from "../../services/acceptance.js";
import { FIELD_KEYS } from "../../services/qualification.js";
import { normalizeCountry } from "../../utils/normalize.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.get(
    "/v1/workspaces/:workspaceId/settings/offer",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      if (!hasCapability(m.role, "manage_settings") && !hasCapability(m.role, "view_accounts")) {
        throw forbidden("Missing capability: view_accounts");
      }
      const db = getDb();
      const [offer] = await db
        .select()
        .from(offers)
        .where(eq(offers.workspaceId, workspaceId))
        .limit(1);
      const playbooks = await db
        .select()
        .from(playbookVersions)
        .where(eq(playbookVersions.workspaceId, workspaceId));
      return {
        offer: offer
          ? {
              ...offer,
              buyerRoles: JSON.parse(offer.buyerRolesJson),
              industries: JSON.parse(offer.industriesJson),
              companySizes: JSON.parse(offer.companySizesJson),
              territory: JSON.parse(offer.territoryJson),
              exclusions: JSON.parse(offer.exclusionsJson),
              structuredQuery: offer.structuredQueryJson
                ? JSON.parse(offer.structuredQueryJson)
                : null,
              unsupportedFilters: JSON.parse(offer.unsupportedFiltersJson),
            }
          : null,
        playbooks: playbooks.map((p) => ({ ...p, rules: JSON.parse(p.rulesJson) })),
      };
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/settings/offer",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "manage_settings");
      const body = z
        .object({
          offering: z.string().min(1).max(300),
          buyerRoles: z.array(z.string().max(80)).max(30).default([]),
          industries: z.array(z.string().max(80)).max(30).default([]),
          companySizes: z.array(z.string().max(20)).max(10).default([]),
          territory: z.array(z.string().max(60)).max(30).default([]),
          exclusions: z.array(z.string().max(200)).max(200).default([]),
          eventWindowDays: z.number().int().min(1).max(3650).default(90),
          naturalLanguageBrief: z.string().max(2000).optional(),
          expectedVersion: z.number().int().optional(),
        })
        .parse(req.body);

      // Territory is stored as ISO codes so region matching uses normalized data (R1)
      const territory: string[] = [];
      for (const t of body.territory) {
        const code = normalizeCountry(t);
        if (!code) throw validationError(`Unknown territory "${t}" — use a country name or ISO code`);
        if (!territory.includes(code)) territory.push(code);
      }

      // Parse NL brief into a visible structured query; surface unsupported filters
      const parsed = body.naturalLanguageBrief ? parseBrief(body.naturalLanguageBrief) : null;
      const structured = {
        offering: body.offering,
        territory,
        industries: body.industries,
        companySizes: body.companySizes,
        eventWindowDays: body.eventWindowDays,
        fromBrief: parsed?.structured ?? null,
      };
      const unsupported = parsed?.unsupported ?? [];

      const db = getDb();
      const [existing] = await db
        .select()
        .from(offers)
        .where(eq(offers.workspaceId, workspaceId))
        .limit(1);

      const values = {
        offering: body.offering,
        buyerRolesJson: JSON.stringify(body.buyerRoles),
        industriesJson: JSON.stringify(body.industries),
        companySizesJson: JSON.stringify(body.companySizes),
        territoryJson: JSON.stringify(territory),
        exclusionsJson: JSON.stringify(body.exclusions),
        eventWindowDays: body.eventWindowDays,
        naturalLanguageBrief: body.naturalLanguageBrief,
        structuredQueryJson: JSON.stringify(structured),
        unsupportedFiltersJson: JSON.stringify(unsupported),
      };

      if (existing) {
        if (body.expectedVersion !== undefined && body.expectedVersion !== existing.version) {
          const { conflict } = await import("../../utils/errors.js");
          throw conflict("Settings were changed by someone else — reload and retry");
        }
        await db
          .update(offers)
          .set({ ...values, version: existing.version + 1, updatedAt: new Date() })
          .where(eq(offers.id, existing.id));
      } else {
        await db.insert(offers).values({
          id: newId("ofr"),
          tenantId: m.tenantId,
          workspaceId,
          ...values,
        });
      }

      await writeAudit({
        tenantId: m.tenantId,
        workspaceId,
        actorUserId: req.actor!.userId,
        action: "settings.offer.updated",
      });

      return { ok: true, territory, unsupportedFilters: unsupported, structuredQuery: structured };
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/settings/active-playbook",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      if (!hasCapability(m.role, "discover") && !hasCapability(m.role, "manage_settings")) {
        throw forbidden("Missing capability: discover");
      }
      const body = z.object({
        templateKey: z.string(),
      }).parse(req.body ?? {});

      const db = getDb();
      await db
        .update(offers)
        .set({
          activePlaybookTemplateKey: body.templateKey,
          updatedAt: new Date(),
        })
        .where(eq(offers.workspaceId, workspaceId));

      await writeAudit({
        tenantId: m.tenantId,
        workspaceId,
        actorUserId: req.actor!.userId,
        action: "settings.active_playbook.updated",
        metadata: { templateKey: body.templateKey },
      });

      return { ok: true, activePlaybookTemplateKey: body.templateKey };
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/settings/event-window",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      if (!hasCapability(m.role, "discover") && !hasCapability(m.role, "manage_settings")) {
        throw forbidden("Missing capability: discover");
      }
      const body = z.object({
        eventWindowDays: z.number().int().positive(),
      }).parse(req.body ?? {});

      const db = getDb();
      await db
        .update(offers)
        .set({
          eventWindowDays: body.eventWindowDays,
          updatedAt: new Date(),
        })
        .where(eq(offers.workspaceId, workspaceId));

      return { ok: true, eventWindowDays: body.eventWindowDays };
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/settings/acceptance-gates",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      await loadMembership(req, workspaceId);
      const db = getDb();
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      return { gates: parseGates(ws?.acceptanceGatesJson), fieldKeys: FIELD_KEYS };
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/settings/acceptance-gates",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "manage_settings");
      const body = z
        .object({ requiredKnownFields: z.array(z.enum(FIELD_KEYS)).max(FIELD_KEYS.length) })
        .parse(req.body);
      const db = getDb();
      await db
        .update(workspaces)
        .set({ acceptanceGatesJson: JSON.stringify(body) })
        .where(eq(workspaces.id, workspaceId));
      await writeAudit({
        tenantId: m.tenantId,
        workspaceId,
        actorUserId: req.actor!.userId,
        action: "settings.acceptance_gates.updated",
        metadata: { requiredKnownFields: body.requiredKnownFields },
      });
      return { gates: body };
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/settings/connections",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      if (!hasCapability(m.role, "manage_settings") && !hasCapability(m.role, "research")) {
        throw forbidden("Missing capability: manage_settings");
      }
      const usage = await getUsage(m.tenantId);
      const entitlements = await ensureEntitlements(m.tenantId, workspaceId);
      const crm = await crmProviderStatus(m.tenantId);
      return {
        research: researchProviderStatus(),
        usage,
        entitlements: {
          researchEnabled: entitlements.researchEnabled,
          researchKillSwitch: entitlements.researchKillSwitch,
        },
        crm: {
          ...crm,
          enabled: entitlements.crmEnabled,
          note: crm.configured
            ? "Accepted accounts can be sent to the CRM from each account page, with a preview first"
            : "No CRM connected yet. A tenant admin can connect one below.",
        },
        sending: {
          enabled: false,
          note: "Phase 1 does not dispatch calls or messages",
        },
      };
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/entitlements",
    { preHandler: authenticateRequired },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const m = await loadMembership(req, workspaceId);
      requireCap(m, "manage_entitlements");
      const body = z
        .object({
          researchEnabled: z.boolean().optional(),
          researchKillSwitch: z.boolean().optional(),
        })
        .parse(req.body);
      const updated = await updateEntitlements(m.tenantId, workspaceId, body);
      await writeAudit({
        tenantId: m.tenantId,
        workspaceId,
        actorUserId: req.actor!.userId,
        action: "entitlements.updated",
        metadata: body,
      });
      return {
        entitlements: {
          researchEnabled: updated.researchEnabled,
          researchKillSwitch: updated.researchKillSwitch,
        },
      };
    },
  );
}
