import { api } from "./client";

export type PlatformCompany = {
  id: string;
  name: string;
  researchQuotaMonthly: number;
  researchUsedMonthly: number;
  createdAt: string;
  workspaces: number;
  members: number;
  membersByRole: Record<string, number>;
  accounts: number;
  /** The CRM this company connected, or null */
  crm: { provider: string; status: string; accountLabel: string | null; connectedAt: string; lastCheckedAt: string | null } | null;
};

export type PlatformOverview = {
  totals: { companies: number; workspaces: number; members: number; accounts: number; crmConnected: number };
  companies: PlatformCompany[];
};

export async function getPlatformOverview() {
  return api<PlatformOverview>("/v1/platform/overview");
}

export async function createCompany(body: {
  companyName: string;
  workspaceName?: string;
  adminEmail: string;
  adminName?: string;
  adminPassword: string;
}) {
  return api<{ tenantId: string; adminEmail: string }>("/v1/platform/tenants", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Set a company's research units used this month back to 0. */
export async function resetCompanyResearch(tenantId: string) {
  return api<{ researchUsedMonthly: number; researchQuotaMonthly: number }>(
    `/v1/platform/tenants/${tenantId}/reset-research`,
    { method: "POST" },
  );
}

export type PlatformWorkspace = {
  id: string;
  name: string;
  tenantId: string;
  companyName: string;
  createdAt: string;
  members: number;
  accounts: number;
};

export async function listPlatformWorkspaces() {
  return api<{ workspaces: PlatformWorkspace[] }>("/v1/platform/workspaces");
}

export type PlatformUsersCompany = {
  id: string;
  name: string;
  createdAt: string;
  /** Distinct active users across the company's workspaces */
  users: number;
  usersByRole: Record<string, number>;
  admins: Array<{ userId: string; name: string; email: string }>;
  workspaces: Array<{ id: string; name: string; users: number }>;
};

export async function getPlatformUsers() {
  return api<{
    totals: { users: number; admins: number; companies: number; workspaces: number };
    companies: PlatformUsersCompany[];
  }>("/v1/platform/users");
}

export async function createWorkspace(body: {
  tenantId: string;
  name: string;
  adminEmail?: string;
  adminName?: string;
  adminPassword?: string;
}) {
  return api<{ workspaceId: string; adminEmails: string[]; existingAccount: boolean }>("/v1/platform/workspaces", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
