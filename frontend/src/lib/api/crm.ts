import { api } from "./client";

export type CrmSyncStatus = "recorded" | "queued" | "synced" | "failed";

export type CrmAccountStatus = {
  provider: string;
  configured: boolean;
  status: CrmSyncStatus | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  syncedAt: string | null;
  companyUrl: string | null;
  dealUrl: string | null;
  contactsSynced: number;
  contactsTotal: number;
};

type PlanAction = "create" | "update" | "link" | "skip";

export type CrmSyncPlan = {
  eligible: boolean;
  blockers: string[];
  company: { action: PlanAction; externalId: string | null; name: string; domain: string | null };
  contacts: Array<{ contactId: string; name: string; action: PlanAction; externalId: string | null; reason?: string }>;
  deal: {
    action: PlanAction;
    externalId: string | null;
    stage: string | null;
    amount: number | null;
    currency: string | null;
    reason?: string;
  };
  warnings: string[];
};

const q = (workspaceId: string) => `?workspaceId=${workspaceId}`;

export function getCrmStatus(accountId: string, workspaceId: string) {
  return api<CrmAccountStatus>(`/v1/accounts/${accountId}/crm${q(workspaceId)}`);
}

export function previewCrmSync(accountId: string, workspaceId: string) {
  return api<CrmSyncPlan>(`/v1/accounts/${accountId}/crm/preview${q(workspaceId)}`, { method: "POST" });
}

export function startCrmSync(accountId: string, workspaceId: string) {
  return api<CrmAccountStatus>(`/v1/accounts/${accountId}/crm/sync${q(workspaceId)}`, { method: "POST" });
}

export const CRM_PROVIDER_LABELS: Record<string, string> = { hubspot: "HubSpot" };
