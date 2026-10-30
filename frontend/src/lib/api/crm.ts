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

export const CRM_PROVIDER_LABELS: Record<string, string> = { hubspot: "HubSpot", salesforce: "Salesforce", other: "Other CRM" };

/* ---------------- The company's CRM connection (Settings → Connections & usage) ---------------- */

export type CrmCatalogEntry = { key: "hubspot" | "salesforce" | "other"; name: string; available: boolean; credentialHelp: string };

/** The company's CRM connection as the browser may see it: never the credential, only its last 4 characters. */
export type CrmConnection = {
  provider: string;
  providerName: string;
  status: "connected" | "failed";
  credentialHint: string;
  accountLabel: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  connectedAt: string;
  connectedByName: string | null;
};

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/crm-connection`;

export function getCrmConnection(workspaceId: string) {
  return api<{ connection: CrmConnection | null; catalog: CrmCatalogEntry[] }>(base(workspaceId));
}

export function connectCrm(workspaceId: string, provider: string, credential: string) {
  return api<{ connection: CrmConnection }>(base(workspaceId), { method: "PUT", body: JSON.stringify({ provider, credential }) });
}

export function testCrmConnection(workspaceId: string) {
  return api<{ connection: CrmConnection }>(`${base(workspaceId)}/test`, { method: "POST", body: "{}" });
}

export function disconnectCrm(workspaceId: string) {
  return api<{ connection: null }>(base(workspaceId), { method: "DELETE" });
}
