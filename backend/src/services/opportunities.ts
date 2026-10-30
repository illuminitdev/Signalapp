import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { opportunities, workspaces, type OpportunityStage } from "../db/schema/index.js";
import { conflict, validationError } from "../utils/errors.js";
import { newId } from "../utils/ids.js";
import { writeAudit } from "./audit.js";

export async function getOpportunity(tenantId: string, workspaceId: string, accountId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.accountId, accountId),
        eq(opportunities.workspaceId, workspaceId),
        eq(opportunities.tenantId, tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Create or update an account's opportunity. Never touches acceptance state, tasks or
 * handoffs (R5, §7): deal stage is recorded on its own. Updates are version-checked.
 */
export async function saveOpportunity(input: {
  tenantId: string;
  workspaceId: string;
  accountId: string;
  actorUserId: string;
  expectedVersion?: number;
  stage: OpportunityStage;
  valueAmount: number | null;
  currency?: string;
  lostReason?: string | null;
  note?: string | null;
}) {
  if (input.stage === "lost" && !input.lostReason?.trim()) {
    throw validationError("Say why the opportunity was lost");
  }
  if (input.valueAmount != null && (!Number.isInteger(input.valueAmount) || input.valueAmount < 0)) {
    throw validationError("Value must be a whole, non-negative amount");
  }

  const db = getDb();
  const existing = await getOpportunity(input.tenantId, input.workspaceId, input.accountId);
  const now = new Date();
  const fields = {
    stage: input.stage,
    valueAmount: input.valueAmount,
    lostReason: input.stage === "lost" ? input.lostReason!.trim() : null,
    note: input.note?.trim() || null,
    updatedBy: input.actorUserId,
    updatedAt: now,
  };

  if (!existing) {
    const [ws] = await db.select({ currency: workspaces.currency }).from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
    const [created] = await db
      .insert(opportunities)
      .values({
        id: newId("opp"),
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        accountId: input.accountId,
        currency: input.currency ?? ws?.currency ?? "GBP",
        createdBy: input.actorUserId,
        stageChangedAt: now,
        ...fields,
      })
      .onConflictDoNothing({ target: opportunities.accountId })
      .returning();
    if (!created) throw conflict("Someone else just created this opportunity. Reload and try again.");
    await writeAudit({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "opportunity.created",
      entityType: "opportunity",
      entityId: created.id,
      metadata: { accountId: input.accountId, stage: created.stage, valueAmount: created.valueAmount, currency: created.currency },
    });
    return created;
  }

  if (input.expectedVersion !== existing.version) {
    throw conflict("This opportunity was changed by someone else. Reload and try again.", {
      currentVersion: existing.version,
    });
  }
  const [updated] = await db
    .update(opportunities)
    .set({
      ...fields,
      currency: input.currency ?? existing.currency,
      version: existing.version + 1,
      stageChangedAt: existing.stage === input.stage ? existing.stageChangedAt : now,
    })
    .where(and(eq(opportunities.id, existing.id), eq(opportunities.version, existing.version)))
    .returning();
  if (!updated) throw conflict("This opportunity was changed by someone else. Reload and try again.");
  await writeAudit({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: existing.stage === updated.stage ? "opportunity.updated" : "opportunity.stage_changed",
    entityType: "opportunity",
    entityId: updated.id,
    metadata: {
      accountId: input.accountId,
      from: { stage: existing.stage, valueAmount: existing.valueAmount, currency: existing.currency },
      to: { stage: updated.stage, valueAmount: updated.valueAmount, currency: updated.currency },
    },
  });
  return updated;
}
