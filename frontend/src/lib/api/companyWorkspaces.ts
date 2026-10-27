import { api } from "./client";
import type { MembershipRow } from "./memberships";

/** Tenant admin's view of every workspace in their company. `workspaceId` is the one they are working in. */
export type CompanyWorkspace = {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  members: number;
  membersByRole: Record<string, number>;
  accounts: number;
  /** The signed-in admin has access to it (shows in their workspace switcher) */
  isMember: boolean;
};

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/company/workspaces`;

export function listCompanyWorkspaces(workspaceId: string) {
  return api<{ workspaces: CompanyWorkspace[] }>(base(workspaceId));
}

export function createCompanyWorkspace(workspaceId: string, name: string) {
  return api<{ workspaceId: string; adminEmails: string[] }>(base(workspaceId), {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function listWorkspaceMembers(workspaceId: string, targetId: string) {
  return api<{
    workspace: { id: string; name: string; currency: string; createdAt: string };
    memberships: MembershipRow[];
  }>(`${base(workspaceId)}/${targetId}/members`);
}

export function addWorkspaceMember(
  workspaceId: string,
  targetId: string,
  body: { email: string; name?: string; role: string; password?: string },
) {
  return api<{ membership: { id: string }; existingAccount: boolean }>(`${base(workspaceId)}/${targetId}/members`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function revokeWorkspaceMember(workspaceId: string, targetId: string, membershipId: string) {
  return api<{ membership: { id: string } }>(`${base(workspaceId)}/${targetId}/members/${membershipId}/revoke`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
