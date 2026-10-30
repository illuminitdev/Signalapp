import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  acceptanceDecisions,
  accountIdentities,
  accounts,
  activities,
  contacts,
  drafts,
  evidence,
  handoffs,
  mergeCandidates,
  opportunities,
  researchRuns,
  roleHypotheses,
  signals,
  tasks,
} from "../db/schema/index.js";
import { notFound, validationError } from "../utils/errors.js";
import { writeAudit } from "./audit.js";

export async function listPendingMergeCandidates(tenantId: string, workspaceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(mergeCandidates)
    .where(
      and(
        eq(mergeCandidates.workspaceId, workspaceId),
        eq(mergeCandidates.tenantId, tenantId),
        eq(mergeCandidates.status, "pending"),
      ),
    );
  const ids = [...new Set(rows.flatMap((r) => [r.accountIdA, r.accountIdB]))];
  const accts = ids.length
    ? await db
        .select({ id: accounts.id, name: accounts.name, domain: accounts.domain, country: accounts.country })
        .from(accounts)
        .where(and(eq(accounts.workspaceId, workspaceId), or(...ids.map((id) => eq(accounts.id, id)))))
    : [];
  const byId = new Map(accts.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, accountA: byId.get(r.accountIdA), accountB: byId.get(r.accountIdB) }));
}

export async function resolveMergeCandidate(input: {
  tenantId: string;
  workspaceId: string;
  candidateId: string;
  action: "merge" | "keep_separate" | "reject";
  /** When merging, which account survives */
  keepAccountId?: string;
  actorUserId: string;
}) {
  const db = getDb();
  const [cand] = await db
    .select()
    .from(mergeCandidates)
    .where(
      and(
        eq(mergeCandidates.id, input.candidateId),
        eq(mergeCandidates.workspaceId, input.workspaceId),
        eq(mergeCandidates.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  if (!cand) throw notFound("Merge candidate not found");
  if (cand.status !== "pending") {
    throw validationError(`Candidate already ${cand.status}`);
  }

  if (input.action === "reject" || input.action === "keep_separate") {
    const status = input.action === "reject" ? "rejected" : "kept_separate";
    await db.update(mergeCandidates).set({ status }).where(eq(mergeCandidates.id, cand.id));
    await writeAudit({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: `merge.${input.action}`,
      entityType: "merge_candidate",
      entityId: cand.id,
    });
    return { status };
  }

  const keepId = input.keepAccountId ?? cand.accountIdA;
  if (keepId !== cand.accountIdA && keepId !== cand.accountIdB) {
    throw validationError("keepAccountId must be one of the candidate accounts");
  }
  const dropId = keepId === cand.accountIdA ? cand.accountIdB : cand.accountIdA;

  const [keep] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, keepId), eq(accounts.workspaceId, input.workspaceId), isNull(accounts.mergedIntoId)))
    .limit(1);
  const [drop] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, dropId), eq(accounts.workspaceId, input.workspaceId), isNull(accounts.mergedIntoId)))
    .limit(1);
  if (!keep || !drop) throw notFound("Account not found for merge");
  if (drop.acceptanceState === "accepted") {
    throw validationError("An accepted account cannot be merged away — keep it as the survivor");
  }

  // Move work and research onto the survivor; the merged record stays as history
  await db.update(evidence).set({ accountId: keepId }).where(eq(evidence.accountId, dropId));
  await db.update(signals).set({ accountId: keepId }).where(eq(signals.accountId, dropId));
  await db.update(tasks).set({ accountId: keepId }).where(eq(tasks.accountId, dropId));
  await db.update(drafts).set({ accountId: keepId }).where(eq(drafts.accountId, dropId));
  await db.update(activities).set({ accountId: keepId }).where(eq(activities.accountId, dropId));
  await db.update(handoffs).set({ accountId: keepId }).where(eq(handoffs.accountId, dropId));
  await db.update(researchRuns).set({ accountId: keepId }).where(eq(researchRuns.accountId, dropId));
  await db
    .update(acceptanceDecisions)
    .set({ accountId: keepId })
    .where(eq(acceptanceDecisions.accountId, dropId));
  await db.update(contacts).set({ accountId: keepId }).where(eq(contacts.accountId, dropId));
  await db.update(roleHypotheses).set({ accountId: keepId }).where(eq(roleHypotheses.accountId, dropId));
  // One opportunity per account: the survivor's deal wins; a lone one on the merged account moves over
  const [keepOpp] = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.accountId, keepId)).limit(1);
  if (!keepOpp) await db.update(opportunities).set({ accountId: keepId }).where(eq(opportunities.accountId, dropId));
  const dropIdentities = await db
    .select()
    .from(accountIdentities)
    .where(eq(accountIdentities.accountId, dropId));
  for (const ident of dropIdentities) {
    await db.update(accountIdentities).set({ accountId: keepId }).where(eq(accountIdentities.id, ident.id));
  }

  await db
    .update(accounts)
    .set({
      mergedIntoId: keepId,
      updatedAt: new Date(),
      version: drop.version + 1,
    })
    .where(eq(accounts.id, dropId));
  // Survivor inherits missing identity fields, never overwrites existing ones
  await db
    .update(accounts)
    .set({
      domain: keep.domain ?? drop.domain,
      country: keep.country ?? drop.country,
      legalName: keep.legalName ?? drop.legalName,
      fitScore: Math.max(keep.fitScore ?? 0, drop.fitScore ?? 0) || keep.fitScore,
      updatedAt: new Date(),
      version: keep.version + 1,
    })
    .where(eq(accounts.id, keepId));

  await db.update(mergeCandidates).set({ status: "merged" }).where(eq(mergeCandidates.id, cand.id));
  // Other pending candidates involving the merged record are superseded
  await db
    .update(mergeCandidates)
    .set({ status: "superseded" })
    .where(
      and(
        eq(mergeCandidates.workspaceId, input.workspaceId),
        eq(mergeCandidates.status, "pending"),
        or(eq(mergeCandidates.accountIdA, dropId), eq(mergeCandidates.accountIdB, dropId)),
      ),
    );

  await writeAudit({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "merge.merged",
    entityType: "merge_candidate",
    entityId: cand.id,
    metadata: { keepAccountId: keepId, mergedAccountId: dropId },
  });

  return { status: "merged", keepAccountId: keepId, mergedAccountId: dropId };
}
