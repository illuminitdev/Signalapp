import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { contacts, evidence, roleHypotheses, type BuyingRole, type ContactSourceType } from "../db/schema/index.js";
import { notFound, validationError } from "../utils/errors.js";
import { newId } from "../utils/ids.js";
import { writeAudit } from "./audit.js";
import { activeSuppressionSet, normalizeSuppressionValue } from "./suppressions.js";

type Scope = { tenantId: string; workspaceId: string; accountId: string };

/** Evidence ids must belong to this account, so a contact can't cite another account's source. */
async function assertEvidenceOnAccount(s: Scope, ids: string[]) {
  if (!ids.length) return;
  const db = getDb();
  const rows = await db
    .select({ id: evidence.id })
    .from(evidence)
    .where(
      and(
        inArray(evidence.id, ids),
        eq(evidence.accountId, s.accountId),
        eq(evidence.workspaceId, s.workspaceId),
        eq(evidence.tenantId, s.tenantId),
      ),
    );
  if (rows.length !== new Set(ids).size) throw validationError("Evidence must come from this account");
}

export async function listPeople(s: Scope) {
  const db = getDb();
  const [people, hypotheses, suppressed] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.accountId, s.accountId), eq(contacts.workspaceId, s.workspaceId), eq(contacts.tenantId, s.tenantId)))
      .orderBy(asc(contacts.createdAt)),
    db
      .select()
      .from(roleHypotheses)
      .where(
        and(
          eq(roleHypotheses.accountId, s.accountId),
          eq(roleHypotheses.workspaceId, s.workspaceId),
          eq(roleHypotheses.tenantId, s.tenantId),
        ),
      )
      .orderBy(asc(roleHypotheses.createdAt)),
    activeSuppressionSet(s.workspaceId),
  ]);
  return {
    contacts: people.map((c) => {
      const email = c.email ? normalizeSuppressionValue(c.email) : null;
      const domain = email?.split("@")[1] ?? null;
      return { ...c, suppressed: Boolean(email && (suppressed.has(email) || (domain && suppressed.has(domain)))) };
    }),
    roleHypotheses: hypotheses.map((h) => ({ ...h, evidenceIds: JSON.parse(h.evidenceIdsJson) as string[] })),
  };
}

export async function createContact(
  s: Scope & {
    actorUserId: string;
    name: string;
    title?: string | null;
    buyingRole: BuyingRole;
    email?: string | null;
    phone?: string | null;
    sourceType: ContactSourceType;
    evidenceId?: string | null;
    sourceNote?: string | null;
  },
) {
  // Never store an unsourced person (R8, §6): every contact names where it came from
  if (s.sourceType === "evidence") {
    if (!s.evidenceId) throw validationError("Choose the evidence this person appears in");
    await assertEvidenceOnAccount(s, [s.evidenceId]);
  } else if (!s.sourceNote?.trim()) {
    throw validationError("Say where this person's details came from");
  }
  const db = getDb();
  const [row] = await db
    .insert(contacts)
    .values({
      id: newId("con"),
      tenantId: s.tenantId,
      workspaceId: s.workspaceId,
      accountId: s.accountId,
      name: s.name.trim(),
      title: s.title?.trim() || null,
      buyingRole: s.buyingRole,
      email: s.email?.trim().toLowerCase() || null,
      phone: s.phone?.trim() || null,
      sourceType: s.sourceType,
      evidenceId: s.sourceType === "evidence" ? s.evidenceId! : null,
      sourceNote: s.sourceNote?.trim() || null,
      // Phase 1 has no verification adapter: research or manual entry never marks a contact verified
      verificationStatus: "unverified",
      createdBy: s.actorUserId,
    })
    .returning();
  await writeAudit({
    tenantId: s.tenantId,
    workspaceId: s.workspaceId,
    actorUserId: s.actorUserId,
    action: "contact.created",
    entityType: "contact",
    entityId: row!.id,
    metadata: { accountId: s.accountId, sourceType: s.sourceType },
  });
  return row!;
}

export async function deleteContact(s: Scope & { actorUserId: string; contactId: string }) {
  const db = getDb();
  const [row] = await db
    .delete(contacts)
    .where(
      and(
        eq(contacts.id, s.contactId),
        eq(contacts.accountId, s.accountId),
        eq(contacts.workspaceId, s.workspaceId),
        eq(contacts.tenantId, s.tenantId),
      ),
    )
    .returning({ id: contacts.id });
  if (!row) throw notFound("Contact not found");
  await writeAudit({
    tenantId: s.tenantId,
    workspaceId: s.workspaceId,
    actorUserId: s.actorUserId,
    action: "contact.deleted",
    entityType: "contact",
    entityId: row.id,
    metadata: { accountId: s.accountId },
  });
}

export async function createRoleHypothesis(
  s: Scope & {
    actorUserId: string;
    roleTitle: string;
    buyingRole: BuyingRole;
    rationale: string;
    evidenceIds: string[];
  },
) {
  await assertEvidenceOnAccount(s, s.evidenceIds);
  const db = getDb();
  const [row] = await db
    .insert(roleHypotheses)
    .values({
      id: newId("rhy"),
      tenantId: s.tenantId,
      workspaceId: s.workspaceId,
      accountId: s.accountId,
      roleTitle: s.roleTitle.trim(),
      buyingRole: s.buyingRole,
      rationale: s.rationale.trim(),
      evidenceIdsJson: JSON.stringify([...new Set(s.evidenceIds)]),
      createdBy: s.actorUserId,
    })
    .returning();
  await writeAudit({
    tenantId: s.tenantId,
    workspaceId: s.workspaceId,
    actorUserId: s.actorUserId,
    action: "role_hypothesis.created",
    entityType: "role_hypothesis",
    entityId: row!.id,
    metadata: { accountId: s.accountId },
  });
  return row!;
}

/** Link a hypothesis to the sourced contact who fills it, or unlink with null. */
export async function linkRoleHypothesis(s: Scope & { actorUserId: string; hypothesisId: string; contactId: string | null }) {
  const db = getDb();
  if (s.contactId) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, s.contactId), eq(contacts.accountId, s.accountId), eq(contacts.tenantId, s.tenantId)))
      .limit(1);
    if (!c) throw validationError("Contact must belong to this account");
  }
  const [row] = await db
    .update(roleHypotheses)
    .set({ contactId: s.contactId })
    .where(
      and(
        eq(roleHypotheses.id, s.hypothesisId),
        eq(roleHypotheses.accountId, s.accountId),
        eq(roleHypotheses.tenantId, s.tenantId),
      ),
    )
    .returning();
  if (!row) throw notFound("Role hypothesis not found");
  await writeAudit({
    tenantId: s.tenantId,
    workspaceId: s.workspaceId,
    actorUserId: s.actorUserId,
    action: s.contactId ? "role_hypothesis.linked" : "role_hypothesis.unlinked",
    entityType: "role_hypothesis",
    entityId: row.id,
    metadata: { accountId: s.accountId, contactId: s.contactId },
  });
  return row;
}

export async function deleteRoleHypothesis(s: Scope & { actorUserId: string; hypothesisId: string }) {
  const db = getDb();
  const [row] = await db
    .delete(roleHypotheses)
    .where(
      and(
        eq(roleHypotheses.id, s.hypothesisId),
        eq(roleHypotheses.accountId, s.accountId),
        eq(roleHypotheses.workspaceId, s.workspaceId),
        eq(roleHypotheses.tenantId, s.tenantId),
      ),
    )
    .returning({ id: roleHypotheses.id });
  if (!row) throw notFound("Role hypothesis not found");
  await writeAudit({
    tenantId: s.tenantId,
    workspaceId: s.workspaceId,
    actorUserId: s.actorUserId,
    action: "role_hypothesis.deleted",
    entityType: "role_hypothesis",
    entityId: row.id,
    metadata: { accountId: s.accountId },
  });
}
