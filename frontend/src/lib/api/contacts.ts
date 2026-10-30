import { api } from "./client";

export const BUYING_ROLES = [
  "decision_maker",
  "budget_holder",
  "technical_evaluator",
  "influencer",
  "procurement",
  "user",
  "unknown",
] as const;
export type BuyingRole = (typeof BUYING_ROLES)[number];

export type Contact = {
  id: string;
  name: string;
  title: string | null;
  buyingRole: BuyingRole;
  email: string | null;
  phone: string | null;
  sourceType: "evidence" | "user_entered";
  evidenceId: string | null;
  sourceNote: string | null;
  verificationStatus: "unverified";
  suppressed: boolean;
  createdAt: string;
};

export type RoleHypothesis = {
  id: string;
  roleTitle: string;
  buyingRole: BuyingRole;
  rationale: string;
  evidenceIds: string[];
  contactId: string | null;
  createdAt: string;
};

const base = (accountId: string) => `/v1/accounts/${accountId}`;

export function listAccountPeople(accountId: string, workspaceId: string) {
  return api<{ contacts: Contact[]; roleHypotheses: RoleHypothesis[] }>(
    `${base(accountId)}/contacts?workspaceId=${workspaceId}`,
  );
}

export function createContact(
  accountId: string,
  workspaceId: string,
  body: {
    name: string;
    title?: string | null;
    buyingRole: BuyingRole;
    email?: string | null;
    phone?: string | null;
    sourceType: "evidence" | "user_entered";
    evidenceId?: string | null;
    sourceNote?: string | null;
  },
) {
  return api<{ contact: Contact }>(`${base(accountId)}/contacts?workspaceId=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteContact(accountId: string, workspaceId: string, contactId: string) {
  return api<{ ok: boolean }>(`${base(accountId)}/contacts/${contactId}?workspaceId=${workspaceId}`, { method: "DELETE" });
}

export function createRoleHypothesis(
  accountId: string,
  workspaceId: string,
  body: { roleTitle: string; buyingRole: BuyingRole; rationale: string; evidenceIds: string[] },
) {
  return api<{ roleHypothesis: RoleHypothesis }>(`${base(accountId)}/role-hypotheses?workspaceId=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function linkRoleHypothesis(accountId: string, workspaceId: string, hypothesisId: string, contactId: string | null) {
  return api<{ roleHypothesis: RoleHypothesis }>(
    `${base(accountId)}/role-hypotheses/${hypothesisId}?workspaceId=${workspaceId}`,
    { method: "PATCH", body: JSON.stringify({ contactId }) },
  );
}

export function deleteRoleHypothesis(accountId: string, workspaceId: string, hypothesisId: string) {
  return api<{ ok: boolean }>(`${base(accountId)}/role-hypotheses/${hypothesisId}?workspaceId=${workspaceId}`, {
    method: "DELETE",
  });
}
