import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  acceptanceDecisions,
  accounts,
  evidence,
  qualificationFacts,
  qualifications,
  workspaces,
  type AcceptanceState,
} from "../db/schema/index.js";
import { conflict, forbidden, notFound, validationError } from "../utils/errors.js";
import { newId } from "../utils/ids.js";
import { writeAudit } from "./audit.js";
import type { MembershipRole } from "../db/schema/identity.js";
import { hasCapability } from "../auth/permissions.js";
import { isSuppressed } from "./suppressions.js";
import { isActiveMember } from "../middleware/requireMembership.js";

/** Return/reject reason categories (R5: category plus optional detail). */
export const reasonCategories = [
  "incomplete_evidence",
  "stale_evidence",
  "not_a_fit",
  "wrong_territory",
  "duplicate",
  "timing",
  "existing_relationship",
  "other",
] as const;
export type ReasonCategory = (typeof reasonCategories)[number];

/** Tenant-specific qualification gates configured at onboarding (R5). */
export type AcceptanceGates = {
  /** Fields that must be known (not "unknown") before acceptance. Budget is not required by default. */
  requiredKnownFields?: string[];
};

export function parseGates(json: string | null | undefined): AcceptanceGates {
  try {
    const parsed = JSON.parse(json || "{}") as AcceptanceGates;
    return {
      requiredKnownFields: Array.isArray(parsed.requiredKnownFields)
        ? parsed.requiredKnownFields.map(String)
        : [],
    };
  } catch {
    return { requiredKnownFields: [] };
  }
}

const submitFrom: AcceptanceState[] = ["draft", "needs_research"];
const reopenFrom: AcceptanceState[] = ["accepted", "rejected"];

export async function transitionAcceptance(input: {
  tenantId: string;
  workspaceId: string;
  accountId: string;
  toState: AcceptanceState;
  actorUserId: string;
  role: MembershipRole;
  reasonCategory?: string;
  reasonDetail?: string;
  nextAction?: string;
  ownerUserId?: string;
  /** Optimistic concurrency — must match account.version (gate 6) */
  expectedVersion?: number;
}) {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.id, input.accountId),
        eq(accounts.workspaceId, input.workspaceId),
        eq(accounts.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  if (!account) throw notFound("Account not found");

  if (input.expectedVersion !== undefined && account.version !== input.expectedVersion) {
    throw conflict("Account version mismatch — reload and retry", {
      currentVersion: account.version,
      acceptanceState: account.acceptanceState,
    });
  }

  const fromState = account.acceptanceState as AcceptanceState;
  const [qual] = await db
    .select()
    .from(qualifications)
    .where(
      and(
        eq(qualifications.accountId, input.accountId),
        eq(qualifications.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  const currentFacts = qual
    ? await db
        .select()
        .from(qualificationFacts)
        .where(
          and(eq(qualificationFacts.qualificationId, qual.id), isNull(qualificationFacts.supersededBy)),
        )
    : [];

  const reason = input.reasonCategory as ReasonCategory | undefined;
  if (reason !== undefined && !reasonCategories.includes(reason)) {
    throw validationError(`Unknown reason category: ${input.reasonCategory}`);
  }

  if (submitFrom.includes(fromState) && input.toState === "ready_for_review") {
    // Researcher submit
    if (!hasCapability(input.role, "submit_review")) {
      throw forbidden("Cannot submit for review");
    }
    // The note for the reviewer is enough; qualification facts are optional detail
    if (!qual?.rationale?.trim()) {
      throw validationError("Can't submit yet — write a short note for the reviewer (the rationale)");
    }
  } else if (fromState === "ready_for_review" && input.toState === "accepted") {
    if (!hasCapability(input.role, "accept")) throw forbidden("Only a sales reviewer can accept");
    const reviewed = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.accountId, input.accountId), isNotNull(evidence.reviewedAt)))
      .limit(1);
    if (!reviewed[0]) throw validationError("Acceptance requires reviewed evidence");
    if (!input.ownerUserId) throw validationError("Acceptance requires an accountable owner");
    if (!(await isActiveMember(input.workspaceId, input.ownerUserId))) {
      throw validationError("Accountable owner must be an active workspace member");
    }
    if (!input.nextAction?.trim()) throw validationError("Acceptance requires a next action");
    if (await isSuppressed(input.workspaceId, account.domain)) {
      throw validationError("Account has an active suppression — cannot accept");
    }

    const [ws] = await db
      .select({ gates: workspaces.acceptanceGatesJson })
      .from(workspaces)
      .where(eq(workspaces.id, input.workspaceId))
      .limit(1);
    const gates = parseGates(ws?.gates);
    for (const field of gates.requiredKnownFields ?? []) {
      const fact = currentFacts.find((f) => f.fieldKey === field);
      if (!fact || fact.basis === "unknown") {
        throw validationError(`Workspace acceptance gate: ${field} must be known`);
      }
    }
  } else if (
    fromState === "ready_for_review" &&
    (input.toState === "needs_research" || input.toState === "rejected")
  ) {
    if (!hasCapability(input.role, "accept")) throw forbidden("Only a sales reviewer can return or reject");
    if (!reason) throw validationError("Return/reject requires a reason category");
  } else if (reopenFrom.includes(fromState) && input.toState === "ready_for_review") {
    if (!hasCapability(input.role, "accept")) {
      throw forbidden("Reopening requires reviewer permission");
    }
    if (!reason && !input.reasonDetail?.trim()) {
      throw validationError("Reopening requires a reason");
    }
  } else {
    // Production prohibits arbitrary state assignment
    throw conflict(`Invalid transition ${fromState} → ${input.toState}`);
  }

  const newVersion = account.version + 1;
  const updated = await db
    .update(accounts)
    .set({
      acceptanceState: input.toState,
      ownerUserId:
        input.toState === "accepted" ? input.ownerUserId : account.ownerUserId,
      version: newVersion,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(accounts.id, input.accountId),
        eq(accounts.version, account.version),
        eq(accounts.acceptanceState, fromState),
      ),
    )
    .returning({ id: accounts.id });

  if (!updated[0]) {
    throw conflict("Concurrent acceptance update — reload and retry");
  }

  await db.insert(acceptanceDecisions).values({
    id: newId("acd"),
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    fromState,
    toState: input.toState,
    reasonCategory: reason,
    reasonDetail: input.reasonDetail,
    // Brief version is taken server-side from the qualification record
    briefVersion: qual ? String(qual.version) : null,
    nextAction: input.nextAction,
    ownerUserId: input.toState === "accepted" ? input.ownerUserId : undefined,
    actorUserId: input.actorUserId,
  });

  await writeAudit({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "acceptance.transition",
    entityType: "account",
    entityId: input.accountId,
    metadata: { fromState, toState: input.toState, version: newVersion, reasonCategory: reason },
  });

  return { fromState, toState: input.toState, version: newVersion };
}
