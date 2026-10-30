import { createHash } from "node:crypto";
import { and, desc, eq, isNull, lt, ne, or } from "drizzle-orm";
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
  providerUsage,
  researchRuns,
} from "../db/schema/index.js";
import { notFound, validationError, conflict } from "../utils/errors.js";
import { newId } from "../utils/ids.js";
import { activeSuppressionSet, isSuppressed } from "./suppressions.js";
import { persistNormalizedEvidence } from "./evidence.js";
import { normalizeDomain } from "../utils/normalize.js";
import { redactString } from "../utils/redact.js";
import { getResearchProvider, isResearchConfigured } from "../providers/research/index.js";
import { reconcileUsage, reserveResearchBudget, refundResearchBudget } from "./budget.js";

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

  // The workspace's own territory; never a made-up default (spec §11)
  let territory: string[] = [];
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
      // Monitors always run live research; the column is kept only for old rows
      isSimulation: false,
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
  patch: { cadenceHours?: number; status?: "active" | "paused" },
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

/** Results asked of the provider per check; also the units reserved before the call. */
export const MONITOR_RESULTS_PER_CHECK = 5;

/** A "running" lock older than this is from a crashed worker and may be taken over. */
const STALE_LOCK_MS = 15 * 60 * 1000;

/**
 * Run states (spec R8 — each is distinct):
 *  success          the check ran and found new material changes
 *  no_results       the check ran and found nothing new (still a successful run)
 *  provider_outage  the research provider failed or timed out
 *  exhausted_budget the tenant's monthly research quota is used up
 *  kill_switch      research is switched off for this workspace
 *  not_configured   live research or the workspace territory isn't set up
 *  already_running  another worker is checking this monitor right now (nothing done)
 */
export type MonitorRunStatus =
  | "success"
  | "no_results"
  | "provider_outage"
  | "exhausted_budget"
  | "kill_switch"
  | "not_configured"
  | "already_running";

const SEARCH_TERMS: Record<string, string> = {
  recruitment: "hiring infrastructure systems engineer site reliability",
  managed_it: "multi-site server hardware refresh IT procurement",
  infrastructure: "data center campus expansion compute server refresh procurement",
};

const NO_COUNTS = { freshEventsCount: 0, skippedDuplicates: 0, skippedSuppressed: 0, evidenceAdded: 0 };

/** True when the monitor's schedule says a check is due now. */
export function isMonitorDue(mon: { lastAttemptAt: Date | null; cadenceHours: number }, now = Date.now()) {
  const last = mon.lastAttemptAt ? new Date(mon.lastAttemptAt).getTime() : 0;
  return now - last >= mon.cadenceHours * 3600 * 1000;
}

/**
 * One check: live licensed research only (spec §11: never substitute demo data).
 * - A per-monitor lock stops two workers checking the same monitor at once.
 * - Budget is reserved before the provider call and reconciled to actual usage (spec §6),
 *   recorded as a research run + provider usage like any other research.
 * - Changes about a company already in your accounts are saved as cited evidence on it (R3).
 */
export async function runMonitorCheck(workspaceId: string, monitorId: string) {
  const db = getDb();
  const [mon] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.workspaceId, workspaceId)))
    .limit(1);

  if (!mon) throw notFound("Monitor not found");

  // Lock: claim the monitor unless another check holds a fresh "running" claim
  const claimed = await db
    .update(monitors)
    .set({ lastRunStatus: "running", updatedAt: new Date() })
    .where(
      and(
        eq(monitors.id, monitorId),
        or(
          isNull(monitors.lastRunStatus),
          ne(monitors.lastRunStatus, "running"),
          lt(monitors.updatedAt, new Date(Date.now() - STALE_LOCK_MS)),
        ),
      ),
    )
    .returning({ id: monitors.id });
  if (!claimed[0]) {
    return {
      monitor: mon,
      ...NO_COUNTS,
      summary: "A check for this monitor is already running.",
      status: "already_running" as MonitorRunStatus,
    };
  }

  const runId = newId("mrun");
  await db.insert(monitorRuns).values({
    id: runId,
    tenantId: mon.tenantId,
    workspaceId,
    monitorId,
    status: "running",
    startedAt: new Date(),
  });

  /** Record the outcome on the run and the monitor (releases the lock). Any completed check counts as last success. */
  async function finish(status: MonitorRunStatus, summary: string, counts = NO_COUNTS, error?: string) {
    const now = new Date();
    const completed = status === "success" || status === "no_results";
    await db
      .update(monitors)
      .set({
        lastAttemptAt: now,
        ...(completed ? { lastSuccessAt: now } : {}),
        lastRunStatus: status,
        updatedAt: now,
      })
      .where(eq(monitors.id, monitorId));
    await db
      .update(monitorRuns)
      .set({ status, resultSummary: summary, error: error ?? null, finishedAt: now })
      .where(eq(monitorRuns.id, runId));
    const [monitor] = await db.select().from(monitors).where(eq(monitors.id, monitorId)).limit(1);
    return { monitor, ...counts, summary, status };
  }

  // 1. Kill switch (spec R8, §9)
  const [ent] = await db.select().from(entitlements).where(eq(entitlements.workspaceId, workspaceId)).limit(1);
  if (ent?.researchKillSwitch) {
    return finish("kill_switch", "Research is switched off for this workspace (kill switch). No check was run.");
  }

  // 2. Live research and a territory are required; nothing is ever made up
  if (!isResearchConfigured()) {
    return finish("not_configured", "Live web research isn't connected. Add the Exa API key to run monitors.");
  }
  let recipe: { territory?: string[]; eventWindowDays?: number; templateKey?: string } = {};
  try {
    recipe = JSON.parse(mon.recipeJson);
  } catch {
    recipe = {};
  }
  // Country codes only (e.g. GB); older monitors may hold a made-up "Texas" default, which never matches
  const territory = (recipe.territory ?? [])
    .filter((c) => /^[A-Za-z]{2}$/.test(c.trim()))
    .map((c) => c.trim().toUpperCase());
  if (!territory.length) {
    return finish("not_configured", "No territory set. Add one under Settings → Offer & targeting, then recreate this monitor.");
  }

  // 3. Reserve budget before the call (spec §6: hard per-tenant caps)
  const reserved = MONITOR_RESULTS_PER_CHECK;
  try {
    await reserveResearchBudget(mon.tenantId, reserved);
  } catch {
    return finish("exhausted_budget", "Monthly research quota is used up. The next check runs when the quota resets.");
  }

  const templateKey = mon.playbookTemplateKey || recipe.templateKey || "infrastructure";
  const query = `${territory.join(", ")} ${SEARCH_TERMS[templateKey] ?? SEARCH_TERMS.infrastructure}`;
  const suppressed = await activeSuppressionSet(workspaceId);
  const filters = {
    countries: territory,
    eventWindowDays: recipe.eventWindowDays ?? 90,
    excludeDomains: [...suppressed].filter((v) => !v.includes("@")),
  };

  // The playbook version this check executes (R1: persisted with each research run)
  const [playbook] = await db
    .select({ id: playbookVersions.id })
    .from(playbookVersions)
    .where(and(eq(playbookVersions.workspaceId, workspaceId), eq(playbookVersions.templateKey, templateKey)))
    .orderBy(desc(playbookVersions.version))
    .limit(1);

  // The check is a research run like any other: usage, provider run ID and evidence point back to it
  const researchRunId = newId("rr");
  await db.insert(researchRuns).values({
    id: researchRunId,
    tenantId: mon.tenantId,
    workspaceId,
    status: "running",
    query,
    mode: "monitor",
    filtersJson: JSON.stringify(filters),
    budgetReserved: reserved,
    playbookVersionId: playbook?.id ?? null,
    createdBy: mon.createdBy,
    startedAt: new Date(),
  });

  // 4. Live provider call; failures give the reservation back
  const provider = getResearchProvider();
  let discovery;
  try {
    discovery = await provider.discover(query, filters, reserved, "discovery");
  } catch (err) {
    await refundResearchBudget(mon.tenantId, reserved);
    const message = redactString(err instanceof Error ? err.message : "Provider outage");
    await db
      .update(researchRuns)
      .set({ status: "failed", errorCode: "provider_error", errorMessage: message, budgetActual: 0, completedAt: new Date() })
      .where(eq(researchRuns.id, researchRunId));
    return finish("provider_outage", "The web research provider failed or timed out. Nothing was charged.", NO_COUNTS, message);
  }

  // 5. Charge what the provider actually used, whether or not anything new turns up
  const usage = await provider.reportUsage(discovery, reserved);
  await db.insert(providerUsage).values({
    id: newId("pug"),
    tenantId: mon.tenantId,
    workspaceId,
    researchRunId,
    provider: provider.name,
    requestRef: usage.requestRef,
    units: usage.units,
  });
  await reconcileUsage(mon.tenantId, reserved, usage.units);

  let freshEventsCount = 0;
  let skippedSuppressed = 0;
  let skippedDuplicates = 0;
  let evidenceAdded = 0;

  for (const item of discovery.items) {
    const domain = normalizeDomain(item.subject?.companyWebsite ?? "") ?? null;
    const title = item.title?.trim() || item.subject?.eventSummary?.trim() || item.canonicalUrl;

    // Suppression (spec §4, §9)
    if (domain && (await isSuppressed(workspaceId, domain))) {
      skippedSuppressed++;
      continue;
    }

    // Deduplicate alerts (spec R8)
    const dedupeKey = generateDedupeKey(domain ?? "", item.canonicalUrl, title);
    const [existingEvent] = await db
      .select({ id: changeEvents.id })
      .from(changeEvents)
      .where(and(eq(changeEvents.workspaceId, workspaceId), eq(changeEvents.dedupeKey, dedupeKey)))
      .limit(1);
    if (existingEvent) {
      skippedDuplicates++;
      continue;
    }

    let matchedAccountId: string | null = null;
    if (domain) {
      const [matchedAcc] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.domain, domain)))
        .limit(1);
      matchedAccountId = matchedAcc?.id ?? null;
    }

    // A change about one of your accounts becomes cited evidence on it (same rules as research: dedupe, dates, source)
    if (matchedAccountId) {
      const saved = await persistNormalizedEvidence({
        tenantId: mon.tenantId,
        workspaceId,
        accountId: matchedAccountId,
        researchRunId,
        items: [{ ...item, matchRationale: item.matchRationale ?? `Monitor "${mon.name}" matched the company website ${domain}` }],
      });
      evidenceAdded += saved.created;
    }

    const detail = item.excerpt?.trim() || item.subject?.eventSummary?.trim() || null;
    await db.insert(changeEvents).values({
      id: newId("che"),
      tenantId: mon.tenantId,
      workspaceId,
      monitorId,
      accountId: matchedAccountId,
      dedupeKey,
      title,
      detail: [detail, `Source: ${item.canonicalUrl}`].filter(Boolean).join(" "),
      material: true,
      discoveredAt: new Date(),
    });
    freshEventsCount++;
  }

  const counts = { freshEventsCount, skippedDuplicates, skippedSuppressed, evidenceAdded };
  const summary =
    `Found ${freshEventsCount} new change${freshEventsCount === 1 ? "" : "s"}` +
    (evidenceAdded ? `, ${evidenceAdded} saved as evidence on your accounts` : "") +
    `. ${skippedDuplicates} duplicate(s) filtered, ${skippedSuppressed} suppressed. ` +
    `${usage.units} research unit${usage.units === 1 ? "" : "s"} used.`;
  await db
    .update(researchRuns)
    .set({
      status: "completed",
      progressPct: 100,
      providerRunId: discovery.providerRunId,
      budgetActual: usage.units,
      resultJson: JSON.stringify({ stage: "done", monitorId, ...counts, noResults: discovery.items.length === 0 }),
      completedAt: new Date(),
    })
    .where(eq(researchRuns.id, researchRunId));
  return finish(freshEventsCount > 0 ? "success" : "no_results", summary, counts);
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

/** Active monitors whose schedule says a check is due (the worker queues one job for each). */
export async function findDueMonitors() {
  const db = getDb();
  const active = await db.select().from(monitors).where(eq(monitors.status, "active"));
  const now = Date.now();
  return active.filter((m) => isMonitorDue(m, now));
}
