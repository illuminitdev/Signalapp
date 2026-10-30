/** Mirrors backend/src/auth/permissions.ts. The server returns each member's list. */
export type Capability =
  | "manage_membership"
  | "manage_settings"
  | "manage_suppressions"
  | "manage_entitlements"
  | "view_accounts"
  | "discover"
  | "import"
  | "research"
  | "review_evidence"
  | "qualify"
  | "submit_review"
  | "accept"
  | "assign_owner"
  | "handoff"
  | "share_handoff"
  | "acknowledge_handoff"
  | "view_tasks"
  | "tasks"
  | "view_drafts"
  | "drafts"
  | "export"
  | "view_outcomes"
  | "view_reports"
  | "manage_pipeline"
  | "manage_integrations";

export const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Tenant admin",
  researcher: "Researcher",
  sdr: "SDR",
  sales_reviewer: "Sales reviewer",
  partner: "Partner",
  analyst: "Analyst",
};

/** Display order for role lists and counts. */
export const ROLE_ORDER = ["tenant_admin", "researcher", "sales_reviewer", "sdr", "partner", "analyst"];

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  tenant_admin: "Members, settings, suppression list, usage limits — and every other action.",
  researcher: "Discover and import accounts, run research, review evidence, qualify and submit for review, drafts.",
  sdr: "Works assigned accounts: tasks, outcomes, qualification notes, approved draft export.",
  sales_reviewer: "Accepts, returns or rejects briefs, assigns owners, prepares and shares partner handoffs.",
  partner: "External recipient. Sees only handoffs shared with them and only the permitted brief fields.",
  analyst: "Read-only reporting. No operational changes.",
};
