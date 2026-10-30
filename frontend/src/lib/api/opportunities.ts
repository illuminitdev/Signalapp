import { api } from "./client";

export const OPPORTUNITY_STAGES = ["qualified", "meeting", "proposal", "negotiation", "won", "lost"] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  qualified: "Qualified",
  meeting: "Meeting",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const OPPORTUNITY_STAGE_CLASSES: Record<OpportunityStage, string> = {
  qualified: "bg-[var(--badge-default-bg)] text-[var(--badge-default-fg)]",
  meeting: "bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]",
  proposal: "bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]",
  negotiation: "bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]",
  won: "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]",
  lost: "bg-[var(--red-tint)] text-[var(--red-active)]",
};

export type Opportunity = {
  id: string;
  accountId: string;
  stage: OpportunityStage;
  valueAmount: number | null;
  currency: string;
  lostReason: string | null;
  note: string | null;
  source: "user_entered" | "crm";
  externalId: string | null;
  syncStatus: "recorded" | "queued" | "synced" | "failed";
  syncedAt: string | null;
  version: number;
  stageChangedAt: string;
  updatedAt: string;
};

export function getOpportunity(accountId: string, workspaceId: string) {
  return api<{ opportunity: Opportunity | null }>(`/v1/accounts/${accountId}/opportunity?workspaceId=${workspaceId}`);
}

export function saveOpportunity(
  accountId: string,
  workspaceId: string,
  body: {
    expectedVersion?: number;
    stage: OpportunityStage;
    valueAmount: number | null;
    currency?: string;
    lostReason?: string | null;
    note?: string | null;
  },
) {
  return api<{ opportunity: Opportunity }>(`/v1/accounts/${accountId}/opportunity?workspaceId=${workspaceId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return "Value unknown";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-GB")}`;
  }
}
