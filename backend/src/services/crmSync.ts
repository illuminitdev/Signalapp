import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  accounts,
  contacts,
  crmMappings,
  opportunities,
  type CrmEntityType,
  type CrmSyncStatus,
  type OpportunityStage,
} from "../db/schema/index.js";
import { CrmError, getCrmProvider, isCrmConfigured, type CrmProvider } from "../providers/crm/index.js";
import type { CrmContactInput, CrmDealStage, CrmObjectType } from "../providers/crm/types.js";
import { notFound, validationError } from "../utils/errors.js";
import { newId } from "../utils/ids.js";
import { redactString } from "../utils/redact.js";
import { writeAudit } from "./audit.js";
import { ensureEntitlements } from "./entitlements.js";
import { activeSuppressionSet, isAccountSuppressed, normalizeSuppressionValue } from "./suppressions.js";

/**
 * Field mapping (spec R8). Our opportunity stages → HubSpot's default "Sales Pipeline" stage ids.
 * A different CRM or pipeline only needs a different map here.
 */
export const CRM_STAGE_MAP: Record<OpportunityStage, string> = {
  qualified: "qualifiedtobuy",
  meeting: "appointmentscheduled",
  proposal: "presentationscheduled",
  negotiation: "contractsent",
  won: "closedwon",
  lost: "closedlost",
};
const CRM_PIPELINE = "default";

type Scope = { tenantId: string; workspaceId: string; accountId: string };

type Action = "create" | "update" | "link" | "skip";
export type SyncPlan = {
  eligible: boolean;
  blockers: string[];
  company: { action: Action; externalId: string | null; name: string; domain: string | null };
  contacts: Array<{ contactId: string; name: string; action: Action; externalId: string | null; reason?: string }>;
  deal: { action: Action; externalId: string | null; stage: string | null; amount: number | null; currency: string | null; reason?: string };
  warnings: string[];
};

/* ---------------- mappings ---------------- */

async function getMappings(s: Scope, provider: string, entityIds: string[]) {
  if (!entityIds.length) return new Map<string, typeof crmMappings.$inferSelect>();
  const db = getDb();
  const rows = await db
    .select()
    .from(crmMappings)
    .where(
      and(
        eq(crmMappings.provider, provider),
        eq(crmMappings.tenantId, s.tenantId),
        eq(crmMappings.workspaceId, s.workspaceId),
        inArray(crmMappings.entityId, entityIds),
      ),
    );
  return new Map(rows.map((r) => [`${r.entityType}:${r.entityId}`, r]));
}

async function upsertMapping(
  s: Scope,
  provider: string,
  entityType: CrmEntityType,
  entityId: string,
  patch: Partial<{
    externalId: string | null;
    syncStatus: CrmSyncStatus;
    lastError: string | null;
    lastAttemptAt: Date;
    syncedAt: Date;
    syncedBy: string;
  }>,
) {
  const db = getDb();
  const now = new Date();
  await db
    .insert(crmMappings)
    .values({ id: newId("crm"), tenantId: s.tenantId, workspaceId: s.workspaceId, provider, entityType, entityId, ...patch })
    .onConflictDoUpdate({
      target: [crmMappings.provider, crmMappings.entityType, crmMappings.entityId],
      set: { ...patch, updatedAt: now },
    });
}

/* ---------------- loading & eligibility ---------------- */

async function loadContext(s: Scope) {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, s.accountId), eq(accounts.workspaceId, s.workspaceId), eq(accounts.tenantId, s.tenantId)))
    .limit(1);
  if (!account) throw notFound("Account not found");
  const [people, [opp], suppressed, entitlements] = await Promise.all([
    db.select().from(contacts).where(and(eq(contacts.accountId, s.accountId), eq(contacts.tenantId, s.tenantId))),
    db.select().from(opportunities).where(and(eq(opportunities.accountId, s.accountId), eq(opportunities.tenantId, s.tenantId))).limit(1),
    activeSuppressionSet(s.workspaceId),
    ensureEntitlements(s.tenantId, s.workspaceId),
  ]);
  const accountSuppressed = await isAccountSuppressed(s.workspaceId, s.accountId);
  const isContactSuppressed = (email: string | null) => {
    if (!email) return false;
    const v = normalizeSuppressionValue(email);
    return suppressed.has(v) || suppressed.has(v.split("@")[1] ?? "");
  };
  const blockers: string[] = [];
  if (!(await isCrmConfigured(s.tenantId))) {
    blockers.push("No CRM is connected. A tenant admin can connect one in Settings → Connections & usage.");
  }
  if (!entitlements.crmEnabled) blockers.push("CRM sync is switched off for this workspace.");
  if (account.mergedIntoId) blockers.push("This account was merged into another account.");
  if (account.acceptanceState !== "accepted") blockers.push("Only sales-accepted accounts can be sent to the CRM.");
  if (accountSuppressed) blockers.push("This account is on the suppression list, so it is never sent to the CRM.");
  return { account, people, opp: opp ?? null, isContactSuppressed, blockers };
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! } : { firstName: parts[0] ?? "", lastName: "" };
}

function contactInput(c: typeof contacts.$inferSelect): CrmContactInput {
  return { ...splitName(c.name), email: c.email, phone: c.phone, jobTitle: c.title };
}

/** Existing CRM id for a record: our mapping first (if it still exists), then a search, else none. */
async function resolve(
  crm: CrmProvider,
  type: CrmObjectType,
  mapped: string | null | undefined,
  search: () => Promise<string | null>,
): Promise<{ id: string | null; action: Action }> {
  if (mapped && (await crm.exists(type, mapped))) return { id: mapped, action: "update" };
  const found = await search();
  return found ? { id: found, action: "link" } : { id: null, action: "create" };
}

/** Deal values are never converted: a currency the CRM doesn't accept blocks the sync up front. */
async function currencyBlocker(crm: CrmProvider, opp: { currency: string; valueAmount: number | null } | null) {
  if (!opp || opp.valueAmount == null) return null;
  const { all } = await crm.currencies();
  if (all.includes(opp.currency)) return null;
  return `The deal value is in ${opp.currency}, but the CRM only accepts ${all.join(", ")}. Add ${opp.currency} as a currency in the CRM, or record the deal in ${all[0]}.`;
}

/* ---------------- preview (dry run) ---------------- */

/** What a sync would do, without writing anything to the CRM (spec R8 dry-run preview). */
export async function previewSync(s: Scope): Promise<SyncPlan> {
  const ctx = await loadContext(s);
  const { account, people, opp } = ctx;
  const plan: SyncPlan = {
    eligible: ctx.blockers.length === 0,
    blockers: ctx.blockers,
    company: { action: "create", externalId: null, name: account.name, domain: account.domain },
    contacts: [],
    deal: { action: "skip", externalId: null, stage: null, amount: null, currency: null, reason: "No deal recorded on this account" },
    warnings: [],
  };
  if (!(await isCrmConfigured(s.tenantId))) return plan;

  const crm = await getCrmProvider(s.tenantId);
  const mappings = await getMappings(s, crm.name, [account.id, ...people.map((p) => p.id), ...(opp ? [opp.id] : [])]);

  const company = await resolve(crm, "company", mappings.get(`account:${account.id}`)?.externalId, () =>
    account.domain ? crm.findCompanyByDomain(account.domain) : Promise.resolve(null),
  );
  plan.company = { ...plan.company, action: company.action, externalId: company.id };

  for (const c of people) {
    if (ctx.isContactSuppressed(c.email)) {
      plan.contacts.push({ contactId: c.id, name: c.name, action: "skip", externalId: null, reason: "Suppressed: do not contact" });
      continue;
    }
    const r = await resolve(crm, "contact", mappings.get(`contact:${c.id}`)?.externalId, () =>
      c.email ? crm.findContactByEmail(c.email) : Promise.resolve(null),
    );
    plan.contacts.push({ contactId: c.id, name: c.name, action: r.action, externalId: r.id });
  }

  if (opp) {
    const mapped = mappings.get(`opportunity:${opp.id}`)?.externalId ?? opp.externalId;
    const exists = mapped ? await crm.exists("deal", mapped) : false;
    plan.deal = {
      action: exists ? "update" : "create",
      externalId: exists ? mapped! : null,
      stage: opp.stage,
      amount: opp.valueAmount,
      currency: opp.currency,
    };
    if (exists) {
      plan.warnings.push("After the first sync the CRM owns the deal's stage and value; only the deal name is updated.");
    }
    const currency = await currencyBlocker(crm, opp);
    if (currency) {
      plan.blockers.push(currency);
      plan.eligible = false;
    }
    const stages = await crm.listDealStages();
    if (!stages.some((st: CrmDealStage) => st.id === CRM_STAGE_MAP[opp.stage] && st.pipelineId === CRM_PIPELINE)) {
      plan.blockers.push(`The CRM has no "${CRM_STAGE_MAP[opp.stage]}" stage in its default pipeline. Check the stage mapping.`);
      plan.eligible = false;
    }
  }
  if (!account.domain) plan.warnings.push("The account has no domain, so an existing CRM company can't be matched by domain.");
  const noEmail = people.filter((p) => !p.email).length;
  if (noEmail) plan.warnings.push(`${noEmail} contact${noEmail === 1 ? " has" : "s have"} no email, so they can only be matched after their first sync.`);
  return plan;
}

/* ---------------- request + run ---------------- */

/** Queue a sync. Local checks run now; the job re-checks everything just before writing (spec R8). */
export async function requestSync(s: Scope & { actorUserId: string }) {
  const ctx = await loadContext(s);
  if (ctx.blockers.length) throw validationError(ctx.blockers[0]!, { blockers: ctx.blockers });
  const crm = await getCrmProvider(s.tenantId);
  await upsertMapping(s, crm.name, "account", s.accountId, { syncStatus: "queued", lastError: null, lastAttemptAt: new Date() });
  await writeAudit({
    tenantId: s.tenantId,
    workspaceId: s.workspaceId,
    actorUserId: s.actorUserId,
    action: "crm.sync_requested",
    entityType: "account",
    entityId: s.accountId,
    metadata: { provider: crm.name },
  });
}

/** Run one account sync against the CRM. Never throws: failures are recorded as Failed with a readable reason. */
export async function runSync(s: Scope & { actorUserId: string }) {
  const crm = (await isCrmConfigured(s.tenantId)) ? await getCrmProvider(s.tenantId).catch(() => null) : null;
  const provider = crm?.name ?? "hubspot";
  const now = new Date();
  try {
    const ctx = await loadContext(s);
    if (ctx.blockers.length || !crm) throw new CrmError(ctx.blockers[0] ?? "No CRM is connected", null, false);
    const { account, people, opp } = ctx;
    const currency = await currencyBlocker(crm, opp);
    if (currency) throw new CrmError(currency, null, false);
    const mappings = await getMappings(s, crm.name, [account.id, ...people.map((p) => p.id), ...(opp ? [opp.id] : [])]);

    // Company: SignalApp owns name/domain/country; empty values are never sent, so CRM data isn't blanked
    const companyInput = { name: account.name, domain: account.domain, country: account.country };
    const company = await resolve(crm, "company", mappings.get(`account:${account.id}`)?.externalId, () =>
      account.domain ? crm.findCompanyByDomain(account.domain) : Promise.resolve(null),
    );
    const companyId = company.id ?? (await crm.createCompany(companyInput));
    // Save the CRM id straight away, so a later failure + retry updates this company instead of duplicating it
    await upsertMapping(s, crm.name, "account", account.id, { externalId: companyId });
    if (company.id) await crm.updateCompany(companyId, companyInput);

    // One bad contact (e.g. an email the CRM rejects) is reported on its own and doesn't stop the rest
    let contactsSynced = 0;
    let contactsSkipped = 0;
    const contactErrors: string[] = [];
    const contactIds: string[] = [];
    for (const c of people) {
      if (ctx.isContactSuppressed(c.email)) {
        contactsSkipped++;
        continue;
      }
      let id: string | null = null;
      try {
        const r = await resolve(crm, "contact", mappings.get(`contact:${c.id}`)?.externalId, () =>
          c.email ? crm.findContactByEmail(c.email) : Promise.resolve(null),
        );
        const input = contactInput(c);
        id = r.id ?? (await crm.createContact(input));
        await upsertMapping(s, crm.name, "contact", c.id, { externalId: id });
        if (r.id) await crm.updateContact(id, input);
        await crm.associate("contact", id, "company", companyId);
        await upsertMapping(s, crm.name, "contact", c.id, { syncStatus: "synced", lastError: null, lastAttemptAt: now, syncedAt: new Date(), syncedBy: s.actorUserId });
        contactIds.push(id);
        contactsSynced++;
      } catch (err) {
        const message = redactString(err instanceof Error ? err.message : "Contact sync failed").slice(0, 300);
        contactErrors.push(`${c.name}: ${message}`);
        await upsertMapping(s, crm.name, "contact", c.id, { syncStatus: "failed", lastError: message, lastAttemptAt: now });
      }
    }

    let dealId: string | null = null;
    let dealNote: string | null = null;
    if (opp) {
      const mapped = mappings.get(`opportunity:${opp.id}`)?.externalId ?? opp.externalId;
      const existing = mapped ? await crm.getDeal(mapped) : null;
      const dealInput = {
        name: `${account.name} – infrastructure opportunity`,
        stageId: CRM_STAGE_MAP[opp.stage],
        pipelineId: CRM_PIPELINE,
        amount: opp.valueAmount,
        currency: opp.currency,
      };
      if (existing) {
        dealId = existing.id;
        // Field ownership: after the first sync the CRM owns stage and value. Differences are reported, never overwritten
        if (existing.stageId !== dealInput.stageId || existing.amount !== dealInput.amount) {
          dealNote = "The CRM deal's stage or value differs from SignalApp; the CRM's values were kept.";
        }
        await crm.updateDeal(dealId, { ...dealInput, stageId: existing.stageId ?? dealInput.stageId, amount: existing.amount, currency: existing.currency ?? dealInput.currency });
      } else {
        dealId = await crm.createDeal(dealInput);
        await upsertMapping(s, crm.name, "opportunity", opp.id, { externalId: dealId });
      }
      await crm.associate("deal", dealId, "company", companyId);
      for (const cid of contactIds) await crm.associate("deal", dealId, "contact", cid);
      await upsertMapping(s, crm.name, "opportunity", opp.id, { externalId: dealId, syncStatus: "synced", lastError: dealNote, lastAttemptAt: now, syncedAt: new Date(), syncedBy: s.actorUserId });
      await getDb()
        .update(opportunities)
        .set({ externalId: dealId, syncStatus: "synced", syncedAt: new Date() })
        .where(eq(opportunities.id, opp.id));
    }

    const notes = [
      dealNote,
      contactErrors.length ? `${contactErrors.length} contact${contactErrors.length === 1 ? "" : "s"} not sent: ${contactErrors.join("; ")}` : null,
    ].filter(Boolean);
    await upsertMapping(s, crm.name, "account", account.id, {
      externalId: companyId,
      syncStatus: "synced",
      lastError: notes.length ? notes.join(" ").slice(0, 1000) : null,
      lastAttemptAt: now,
      syncedAt: new Date(),
      syncedBy: s.actorUserId,
    });
    await writeAudit({
      tenantId: s.tenantId,
      workspaceId: s.workspaceId,
      actorUserId: s.actorUserId,
      action: "crm.synced",
      entityType: "account",
      entityId: account.id,
      metadata: { provider: crm.name, companyId, dealId, contactsSynced, contactsSkipped, contactsFailed: contactErrors.length, conflict: Boolean(dealNote) },
    });
  } catch (err) {
    const message = redactString(err instanceof Error ? err.message : "CRM sync failed").slice(0, 500);
    await upsertMapping(s, provider, "account", s.accountId, { syncStatus: "failed", lastError: message, lastAttemptAt: now });
    const [opp] = await getDb().select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.accountId, s.accountId)).limit(1);
    if (opp) await getDb().update(opportunities).set({ syncStatus: "failed" }).where(eq(opportunities.id, opp.id));
    await writeAudit({
      tenantId: s.tenantId,
      workspaceId: s.workspaceId,
      actorUserId: s.actorUserId,
      action: "crm.sync_failed",
      entityType: "account",
      entityId: s.accountId,
      metadata: { provider, error: message },
    });
  }
}

/* ---------------- status ---------------- */

/** Current CRM state of an account, with links into the CRM's own UI. */
export async function getSyncStatus(s: Scope) {
  const db = getDb();
  const [people, [opp]] = await Promise.all([
    db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.accountId, s.accountId), eq(contacts.tenantId, s.tenantId))),
    db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.accountId, s.accountId), eq(opportunities.tenantId, s.tenantId))).limit(1),
  ]);
  const crm = (await isCrmConfigured(s.tenantId)) ? await getCrmProvider(s.tenantId).catch(() => null) : null;
  const provider = crm?.name ?? "hubspot";
  const mappings = await getMappings(s, provider, [s.accountId, ...people.map((p) => p.id), ...(opp ? [opp.id] : [])]);
  const acc = mappings.get(`account:${s.accountId}`);
  const dealMap = opp ? mappings.get(`opportunity:${opp.id}`) : undefined;
  return {
    provider,
    configured: Boolean(crm),
    status: (acc?.syncStatus ?? null) as CrmSyncStatus | null,
    lastError: acc?.lastError ?? null,
    lastAttemptAt: acc?.lastAttemptAt ?? null,
    syncedAt: acc?.syncedAt ?? null,
    companyUrl: crm && acc?.externalId ? crm.recordUrl("company", acc.externalId) : null,
    dealUrl: crm && dealMap?.externalId ? crm.recordUrl("deal", dealMap.externalId) : null,
    contactsSynced: people.filter((p) => mappings.get(`contact:${p.id}`)?.syncStatus === "synced").length,
    contactsTotal: people.length,
  };
}
