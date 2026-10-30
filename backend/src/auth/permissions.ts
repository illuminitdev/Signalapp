import type { MembershipRole } from "../db/schema/identity.js";

export const capabilities = [
  "manage_membership",
  "manage_settings",
  "manage_suppressions",
  "manage_entitlements",
  "view_accounts",
  "discover",
  "import",
  "research",
  "review_evidence",
  "qualify",
  "submit_review",
  "accept",
  "assign_owner",
  "handoff",
  "share_handoff",
  "acknowledge_handoff",
  "view_tasks",
  "tasks",
  "view_drafts",
  "drafts",
  "export",
  "view_outcomes",
  "view_reports",
  "manage_pipeline",
  "manage_integrations",
] as const;
export type Capability = (typeof capabilities)[number];

/** Role → capability map (spec §4). Enforced server-side on every route. */
const roleCaps: Record<MembershipRole, readonly Capability[]> = {
  tenant_admin: capabilities,
  researcher: [
    "view_accounts",
    "discover",
    "import",
    "research",
    "review_evidence",
    "qualify",
    "submit_review",
    "view_tasks",
    "tasks",
    "view_drafts",
    "drafts",
    "export",
    "view_outcomes",
  ],
  // SDR account reads are further scoped to assigned accounts (see accountScope).
  sdr: [
    "view_accounts",
    "qualify",
    "view_tasks",
    "tasks",
    "view_drafts",
    "drafts",
    "export",
    "view_outcomes",
    "manage_pipeline",
  ],
  sales_reviewer: [
    "view_accounts",
    "review_evidence",
    "qualify",
    "accept",
    "assign_owner",
    "handoff",
    "share_handoff",
    "view_tasks",
    "tasks",
    "view_drafts",
    "export",
    "view_outcomes",
    "view_reports",
    "manage_pipeline",
    "manage_integrations",
  ],
  // Partners only see handoffs expressly shared with them; no workspace reads.
  partner: ["acknowledge_handoff"],
  analyst: ["view_outcomes", "view_reports"],
};

export function hasCapability(role: MembershipRole, cap: Capability): boolean {
  return roleCaps[role]?.includes(cap) ?? false;
}

export function capabilitiesFor(role: MembershipRole): Capability[] {
  return [...(roleCaps[role] ?? [])];
}
