import { api } from "./client";

export type Offer = {
  offering: string;
  activePlaybookTemplateKey?: string;
  buyerRoles: string[];
  industries: string[];
  companySizes: string[];
  territory: string[];
  exclusions: string[];
  eventWindowDays: number;
  naturalLanguageBrief: string | null;
  structuredQuery: Record<string, unknown> | null;
  unsupportedFilters: string[];
  version: number;
};

export type Playbook = {
  id: string;
  name: string;
  templateKey: string;
  version: number;
  rules: { signals?: string[] };
};

export function getOffer(workspaceId: string) {
  return api<{ offer: Offer | null; playbooks: Playbook[] }>(
    `/v1/workspaces/${workspaceId}/settings/offer`,
  );
}

export function saveOffer(workspaceId: string, body: Record<string, unknown>) {
  return api<{ ok: boolean; territory: string[]; unsupportedFilters: string[]; structuredQuery: Record<string, unknown> }>(
    `/v1/workspaces/${workspaceId}/settings/offer`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export function setActivePlaybook(workspaceId: string, templateKey: string) {
  return api<{ ok: boolean; activePlaybookTemplateKey: string }>(
    `/v1/workspaces/${workspaceId}/settings/active-playbook`,
    { method: "PUT", body: JSON.stringify({ templateKey }) },
  );
}

export function setEventWindow(workspaceId: string, eventWindowDays: number) {
  return api<{ ok: boolean; eventWindowDays: number }>(
    `/v1/workspaces/${workspaceId}/settings/event-window`,
    { method: "PUT", body: JSON.stringify({ eventWindowDays }) },
  );
}

export function getAcceptanceGates(workspaceId: string) {
  return api<{ gates: { requiredKnownFields: string[] }; fieldKeys: string[] }>(
    `/v1/workspaces/${workspaceId}/settings/acceptance-gates`,
  );
}

export function saveAcceptanceGates(workspaceId: string, requiredKnownFields: string[]) {
  return api<{ gates: { requiredKnownFields: string[] } }>(
    `/v1/workspaces/${workspaceId}/settings/acceptance-gates`,
    { method: "PUT", body: JSON.stringify({ requiredKnownFields }) },
  );
}

export type Connections = {
  research: { provider: string; configured: boolean };
  usage: { quotaMonthly: number; usedMonthly: number; periodStart: string | null };
  entitlements: { researchEnabled: boolean; researchKillSwitch: boolean };
  crm: { configured: boolean; note: string };
  sending: { enabled: boolean; note: string };
};

export function getConnections(workspaceId: string) {
  return api<Connections>(`/v1/workspaces/${workspaceId}/settings/connections`);
}

export function patchEntitlements(
  workspaceId: string,
  body: { researchEnabled?: boolean; researchKillSwitch?: boolean },
) {
  return api<{ entitlements: Connections["entitlements"] }>(`/v1/workspaces/${workspaceId}/entitlements`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type Outcomes = {
  cohort: { from: string; to: string; dateBasis: string; decisionRule: string };
  currency: string;
  denominators: { accountsWithReviewerDecision: number };
  metrics: {
    uniqueResearchReviewedAccounts: number;
    explicitSalesAccepted: number;
    returnedDecisions: number;
    rejectedDecisions: number;
    acceptanceRate: number | null;
    reviewerDecisionEvents: number;
    completedSdrActions: number;
    openSdrTasks: number;
    cancelledSdrActions: number;
    partnerHandoffsPrepared: number;
    partnerHandoffsShared: number;
    crmOpportunities: number | null;
    meetings: number | null;
    attribution: string;
  };
  breakdowns: {
    activityByTaskType: Record<string, number>;
    rejectionReasons: Record<string, number>;
    researchQuality: Record<string, number>;
  };
  notes: string[];
};

export function getOutcomes(workspaceId: string, from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  return api<Outcomes>(`/v1/workspaces/${workspaceId}/outcomes${qs.size ? `?${qs}` : ""}`);
}
