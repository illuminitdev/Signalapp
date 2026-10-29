import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  changeEvents,
  monitorRuns,
  monitors,
  offers,
  playbookVersions,
  workspaces,
  entitlements,
  accounts,
} from "../db/schema/index.js";
import { notFound, validationError, conflict } from "../utils/errors.js";
import { newId } from "../utils/ids.js";
import { isSuppressed } from "./suppressions.js";
import { isExaConfigured } from "../config/env.js";
import { getResearchProvider, isResearchConfigured } from "../providers/research/index.js";
import { reserveResearchBudget, refundResearchBudget } from "./budget.js";

const PLAYBOOK_DISPLAY_NAMES: Record<string, string> = {
  infrastructure: "Infrastructure expansion",
  recruitment: "Hiring demand",
  managed_it: "Multi-site IT support",
};

export function generateDedupeKey(domain: string, sourceUrl: string, headline: string): string {
  const normDomain = domain.toLowerCase().trim();
  const normUrl = sourceUrl.toLowerCase().trim();
  const normHeadline = headline.toLowerCase().trim();
  return createHash("sha256").update(`${normDomain}|${normUrl}|${normHeadline}`).digest("hex");
}

export async function listMonitors(workspaceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(monitors)
    .where(eq(monitors.workspaceId, workspaceId))
    .orderBy(desc(monitors.createdAt));

  return rows.map((r) => ({
    ...r,
    name: PLAYBOOK_DISPLAY_NAMES[r.playbookTemplateKey] ?? r.name,
  }));
}

export async function createMonitorFromPlaybook(workspaceId: string, userId: string) {
  const db = getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) throw notFound("Workspace not found");

  // Read workspace offer configuration
  const [offer] = await db
    .select()
    .from(offers)
    .where(eq(offers.workspaceId, workspaceId))
    .limit(1);

  // Read active playbook template from offer
  const activeTemplateKey = offer?.activePlaybookTemplateKey ?? "infrastructure";
  const [playbook] = await db
    .select()
    .from(playbookVersions)
    .where(and(eq(playbookVersions.workspaceId, workspaceId), eq(playbookVersions.templateKey, activeTemplateKey)))
    .limit(1);

  let territory: string[] = ["Texas"];
  if (offer?.territoryJson) {
    try {
      const parsed = JSON.parse(offer.territoryJson) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        territory = parsed;
      }
    } catch {
      // fallback
    }
  }

  const windowDays = offer?.eventWindowDays ?? 180;
  const templateKey = playbook?.templateKey ?? activeTemplateKey ?? "infrastructure";
  const playbookName = PLAYBOOK_DISPLAY_NAMES[templateKey] ?? playbook?.name ?? "Infrastructure expansion";

  const templateSignals: Record<string, string[]> = {
    infrastructure: ["expansion", "infra_hiring", "refresh", "compute", "procurement"],
    recruitment: ["infra_hiring", "expansion"],
    managed_it: ["refresh", "expansion", "procurement"],
  };

  const recipe = {
    territory,
    eventWindowDays: windowDays,
    templateKey,
    signals: templateSignals[templateKey] ?? ["expansion", "infrastructure_hiring"],
  };

  const id = newId("mon");
  // Kept unchecked (simulation) by default to protect API quota; user can check "Live Exa search" on demand
  const isSimulation = true;
  const [created] = await db
    .insert(monitors)
    .values({
      id,
      tenantId: ws.tenantId,
      workspaceId,
      name: playbookName,
      playbookTemplateKey: templateKey,
      recipeJson: JSON.stringify(recipe),
      cadenceHours: 168, // Weekly
      status: "active",
      isSimulation,
      lastSuccessAt: null,
      lastAttemptAt: null,
      lastRunStatus: null,
      createdBy: userId,
    })
    .returning();

  return created;
}

export async function updateMonitor(
  workspaceId: string,
  monitorId: string,
  patch: { cadenceHours?: number; status?: "active" | "paused"; isSimulation?: boolean },
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.workspaceId, workspaceId)))
    .limit(1);

  if (!existing) throw notFound("Monitor not found");

  const values: Partial<typeof monitors.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.cadenceHours !== undefined) {
    if (patch.cadenceHours <= 0) throw validationError("Cadence must be greater than 0");
    values.cadenceHours = patch.cadenceHours;
  }
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "paused") {
      throw validationError("Invalid status");
    }
    values.status = patch.status;
  }
  if (patch.isSimulation !== undefined) {
    values.isSimulation = patch.isSimulation;
  }

  const [updated] = await db
    .update(monitors)
    .set(values)
    .where(and(eq(monitors.id, monitorId), eq(monitors.workspaceId, workspaceId)))
    .returning();

  return updated;
}

export async function deleteMonitor(workspaceId: string, monitorId: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.workspaceId, workspaceId)))
    .limit(1);

  if (!existing) throw notFound("Monitor not found");

  // Explicitly remove child change events & monitor runs to guarantee clean delete
  await db
    .delete(changeEvents)
    .where(and(eq(changeEvents.workspaceId, workspaceId), eq(changeEvents.monitorId, monitorId)));

  await db
    .delete(monitorRuns)
    .where(and(eq(monitorRuns.workspaceId, workspaceId), eq(monitorRuns.monitorId, monitorId)));

  await db
    .delete(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.workspaceId, workspaceId)));

  return { success: true };
}

export async function simulateChangeCheck(workspaceId: string, monitorId: string) {
  const db = getDb();
  const [mon] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.workspaceId, workspaceId)))
    .limit(1);

  if (!mon) throw notFound("Monitor not found");

  const runId = newId("mrun");
  await db.insert(monitorRuns).values({
    id: runId,
    tenantId: mon.tenantId,
    workspaceId,
    monitorId,
    status: "running",
    startedAt: new Date(),
  });

  // 1. Check entitlements & kill-switch (Spec §5 R8, §9)
  const [ent] = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.workspaceId, workspaceId))
    .limit(1);

  if (ent?.researchKillSwitch) {
    const now = new Date();
    await db
      .update(monitors)
      .set({
        lastAttemptAt: now,
        lastRunStatus: "exhausted_budget",
        updatedAt: now,
      })
      .where(eq(monitors.id, monitorId));

    await db
      .update(monitorRuns)
      .set({
        status: "exhausted_budget",
        resultSummary: "Research kill-switch active; monitoring halted.",
        finishedAt: now,
      })
      .where(eq(monitorRuns.id, runId));

    const [updatedMonitor] = await db
      .select()
      .from(monitors)
      .where(eq(monitors.id, monitorId))
      .limit(1);

    return {
      monitor: updatedMonitor,
      freshEventsCount: 0,
      skippedDuplicates: 0,
      skippedSuppressed: 0,
      summary: "Research kill-switch is active; monitoring jobs halted.",
      status: "exhausted_budget",
    };
  }

  // 2. Budget Reservation if Live (Spec §5 R8, §6)
  let unitsReserved = 0;
  if (!mon.isSimulation && isResearchConfigured()) {
    try {
      await reserveResearchBudget(mon.tenantId, 1);
      unitsReserved = 1;
    } catch {
      const now = new Date();
      await db
        .update(monitors)
        .set({
          lastAttemptAt: now,
          lastRunStatus: "exhausted_budget",
          updatedAt: now,
        })
        .where(eq(monitors.id, monitorId));

      await db
        .update(monitorRuns)
        .set({
          status: "exhausted_budget",
          resultSummary: "Monthly research quota exhausted for tenant.",
          finishedAt: now,
        })
        .where(eq(monitorRuns.id, runId));

      const [updatedMonitor] = await db
        .select()
        .from(monitors)
        .where(eq(monitors.id, monitorId))
        .limit(1);

      return {
        monitor: updatedMonitor,
        freshEventsCount: 0,
        skippedDuplicates: 0,
        skippedSuppressed: 0,
        summary: "Monthly research quota exhausted.",
        status: "exhausted_budget",
      };
    }
  }

  // Parse recipe for context
  let recipe: { territory?: string[]; eventWindowDays?: number; templateKey?: string } = {};
  try {
    recipe = JSON.parse(mon.recipeJson);
  } catch {
    recipe = { territory: ["Texas"], eventWindowDays: 180 };
  }

  const territoryStr = (recipe.territory && recipe.territory.length > 0)
    ? recipe.territory.join(", ")
    : "Texas";

  const templateKey = mon.playbookTemplateKey || recipe.templateKey || "infrastructure";

  let candidateSignals: Array<{
    companyName: string;
    domain: string;
    title: string;
    detail: string;
    sourceUrl: string;
    material: boolean;
  }> = [];

  // 3. Live Exa Web Research vs. Simulation (Spec §6 & §11)
  if (!mon.isSimulation && isResearchConfigured()) {
    try {
      const provider = getResearchProvider();
      const queryTerms =
        templateKey === "recruitment"
          ? "hiring infrastructure systems engineer site reliability"
          : templateKey === "managed_it"
          ? "multi-site server hardware refresh IT procurement"
          : "data center campus groundbreaking expansion compute liquid cooling";

      const fullQuery = `${territoryStr} ${queryTerms}`;
      const discovery = await provider.discover(
        fullQuery,
        {
          countries: recipe.territory && recipe.territory.length > 0 ? recipe.territory : undefined,
          eventWindowDays: recipe.eventWindowDays ?? 90,
        },
        5,
        "discovery",
      );

      candidateSignals = discovery.items.map((item) => {
        const companyName = item.subject?.companyName || item.publisher || "Enterprise Infrastructure";
        const domain = item.subject?.companyWebsite || (item.publisher ? `${item.publisher}` : "example.com");
        return {
          companyName,
          domain,
          title: item.title || `${companyName} expands infrastructure in ${territoryStr}`,
          detail: item.excerpt || item.subject?.eventSummary || `Infrastructure signal detected for ${companyName}.`,
          sourceUrl: item.canonicalUrl,
          material: true,
        };
      });
    } catch (err) {
      if (unitsReserved > 0) {
        await refundResearchBudget(mon.tenantId, unitsReserved);
      }
      const now = new Date();
      const errMsg = err instanceof Error ? err.message : "Provider outage";
      await db
        .update(monitors)
        .set({
          lastAttemptAt: now,
          lastRunStatus: "provider_outage",
          updatedAt: now,
        })
        .where(eq(monitors.id, monitorId));

      await db
        .update(monitorRuns)
        .set({
          status: "provider_outage",
          error: errMsg,
          resultSummary: "Web research provider outage or timeout.",
          finishedAt: now,
        })
        .where(eq(monitorRuns.id, runId));

      const [updatedMonitor] = await db
        .select()
        .from(monitors)
        .where(eq(monitors.id, monitorId))
        .limit(1);

      return {
        monitor: updatedMonitor,
        freshEventsCount: 0,
        skippedDuplicates: 0,
        skippedSuppressed: 0,
        summary: "Web research provider outage or timeout.",
        status: "provider_outage",
      };
    }
  } else {
    // Simulation mode fallback
    const workspaceAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.workspaceId, workspaceId))
      .limit(5);

    const acc0Name = workspaceAccounts[0]?.name ?? "Aligned Data Centers";
    const acc0Domain = workspaceAccounts[0]?.domain ?? "aligneddc.com";
    const acc1Name = workspaceAccounts[1]?.name ?? "Stream Data Centers";
    const acc1Domain = workspaceAccounts[1]?.domain ?? "streamdatacenters.com";
    const acc2Name = workspaceAccounts[2]?.name ?? "Skybox Datacenters";
    const acc2Domain = workspaceAccounts[2]?.domain ?? "skyboxdatacenters.com";

    if (templateKey === "recruitment") {
      candidateSignals = [
        {
          companyName: acc0Name,
          domain: acc0Domain,
          title: `${acc0Name} actively hiring 25+ infrastructure & systems engineers in ${territoryStr}`,
          detail: `Published multiple senior infrastructure engineering and platform engineering job openings supporting new facility deployment in ${territoryStr}.`,
          sourceUrl: `https://jobs.example.com/${acc0Domain}/infrastructure-hiring-${territoryStr.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          material: true,
        },
        {
          companyName: acc1Name,
          domain: acc1Domain,
          title: `${acc1Name} appoints VP of Infrastructure to scale ${territoryStr} operations`,
          detail: `Announced executive hiring to build out regional cloud and hardware engineering teams across ${territoryStr}.`,
          sourceUrl: `https://news.example.com/${acc1Domain}/vp-infrastructure-${territoryStr.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          material: true,
        },
        {
          companyName: acc2Name,
          domain: acc2Domain,
          title: `${acc2Name} opens recruitment for senior datacenter site reliability engineers in ${territoryStr}`,
          detail: `New job posts identify urgent hiring for enterprise server maintenance and high-availability operations in ${territoryStr}.`,
          sourceUrl: `https://careers.example.com/${acc2Domain}/sre-roles-${territoryStr.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          material: true,
        },
      ];
    } else if (templateKey === "managed_it") {
      candidateSignals = [
        {
          companyName: acc0Name,
          domain: acc0Domain,
          title: `${acc0Name} issues procurement RFP for multi-site enterprise IT infrastructure in ${territoryStr}`,
          detail: `Published request for proposals covering managed hardware, server refresh cycles, and SLA support for regional branches in ${territoryStr}.`,
          sourceUrl: `https://procurement.example.com/${acc0Domain}/managed-it-rfp-${territoryStr.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          material: true,
        },
        {
          companyName: acc1Name,
          domain: acc1Domain,
          title: `${acc1Name} initiates multi-site server hardware refresh across ${territoryStr} locations`,
          detail: `Planning migration and managed infrastructure transition for distributed server estates in ${territoryStr}.`,
          sourceUrl: `https://news.example.com/${acc1Domain}/server-refresh-${territoryStr.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          material: true,
        },
      ];
    } else {
      candidateSignals = [
        {
          companyName: acc0Name,
          domain: acc0Domain,
          title: `${acc0Name} expands ${territoryStr} campus with 120MW facility`,
          detail: `Announced the groundbreaking of a multi-facility expansion in ${territoryStr} to support high-density compute and liquid cooling infrastructure.`,
          sourceUrl: `https://datacenterfrontier.example.com/${acc0Domain}/aligned-expansion-${territoryStr.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          material: true,
        },
        {
          companyName: acc1Name,
          domain: acc1Domain,
          title: `${acc1Name} acquires 200 acres in ${territoryStr} for hyperscale cloud deployment`,
          detail: `Acquisition of 200-acre tract in ${territoryStr} for purpose-built enterprise server clusters and high-density compute infrastructure.`,
          sourceUrl: `https://news.example.com/${acc1Domain}/stream-expansion-${territoryStr.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          material: true,
        },
        {
          companyName: acc2Name,
          domain: acc2Domain,
          title: `${acc2Name} breaks ground on 100MW campus in ${territoryStr}`,
          detail: `New construction begun on enterprise compute and server migration facilities targeting high-performance workloads in ${territoryStr}.`,
          sourceUrl: `https://techwire.example.com/${acc2Domain}/groundbreaking-${territoryStr.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          material: true,
        },
      ];
    }
  }

  let freshEventsCount = 0;
  let skippedSuppressed = 0;
  let skippedDuplicates = 0;

  for (const sig of candidateSignals) {
    // 4. Suppression Check (Spec §4, §9)
    const suppressed = await isSuppressed(workspaceId, sig.domain);
    if (suppressed) {
      skippedSuppressed++;
      continue;
    }

    // 5. Deduplication Check (Spec §5 R8, §7)
    const dedupeKey = generateDedupeKey(sig.domain, sig.sourceUrl, sig.title);
    const [existingEvent] = await db
      .select({ id: changeEvents.id })
      .from(changeEvents)
      .where(and(eq(changeEvents.workspaceId, workspaceId), eq(changeEvents.dedupeKey, dedupeKey)))
      .limit(1);

    if (existingEvent) {
      skippedDuplicates++;
      continue;
    }

    // 6. Match account if exists
    let matchedAccountId: string | null = null;
    const [matchedAcc] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.domain, sig.domain)))
      .limit(1);

    if (matchedAcc) {
      matchedAccountId = matchedAcc.id;
    }

    // 7. Insert change event
    await db.insert(changeEvents).values({
      id: newId("che"),
      tenantId: mon.tenantId,
      workspaceId,
      monitorId,
      accountId: matchedAccountId,
      dedupeKey,
      title: sig.title,
      detail: `${sig.detail} Source: ${sig.sourceUrl}`,
      material: sig.material,
      discoveredAt: new Date(),
    });

    freshEventsCount++;
  }

  // If no new events were found and we reserved units, refund the reservation
  if (freshEventsCount === 0 && unitsReserved > 0) {
    await refundResearchBudget(mon.tenantId, unitsReserved);
  }

  const now = new Date();
  const runStatus = freshEventsCount > 0 ? "success" : "no_results";
  const resultSummary = `Discovered ${freshEventsCount} fresh material signals. ${skippedDuplicates} duplicate(s) filtered, ${skippedSuppressed} suppressed.`;

  // 8. Update monitor record: preserve lastSuccessAt if no new material signals (Spec §5 R8)
  await db
    .update(monitors)
    .set({
      lastAttemptAt: now,
      ...(freshEventsCount > 0 ? { lastSuccessAt: now } : {}),
      lastRunStatus: runStatus,
      updatedAt: now,
    })
    .where(eq(monitors.id, monitorId));

  // 9. Update monitor run record
  await db
    .update(monitorRuns)
    .set({
      status: runStatus,
      resultSummary,
      finishedAt: now,
    })
    .where(eq(monitorRuns.id, runId));

  const [updatedMonitor] = await db
    .select()
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  return {
    monitor: updatedMonitor,
    freshEventsCount,
    skippedDuplicates,
    skippedSuppressed,
    summary: resultSummary,
    status: runStatus,
  };
}

export async function listChangeEvents(workspaceId: string, monitorId?: string) {
  const db = getDb();
  const conditions = [eq(changeEvents.workspaceId, workspaceId)];
  if (monitorId) {
    conditions.push(eq(changeEvents.monitorId, monitorId));
  }

  return db
    .select()
    .from(changeEvents)
    .where(and(...conditions))
    .orderBy(desc(changeEvents.discoveredAt))
    .limit(50);
}

/**
 * Background worker task: checks all active monitors across workspaces and runs due checks
 */
export async function runDueMonitors() {
  const db = getDb();
  const allActive = await db
    .select()
    .from(monitors)
    .where(eq(monitors.status, "active"));

  const now = Date.now();
  let executedCount = 0;

  for (const m of allActive) {
    const lastAttempt = m.lastAttemptAt ? new Date(m.lastAttemptAt).getTime() : 0;
    const intervalMs = m.cadenceHours * 3600 * 1000;
    // Check if the monitor has never run or if the interval elapsed
    if (now - lastAttempt >= intervalMs) {
      try {
        await simulateChangeCheck(m.workspaceId, m.id);
        executedCount++;
      } catch (err) {
        console.error(`[monitor-runner] error running monitor ${m.id}:`, err);
      }
    }
  }

  return { executedCount, totalActive: allActive.length };
}
