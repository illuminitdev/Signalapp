import { api } from "./client";

export type ResearchFilters = {
  countries?: string[];
  industries?: string[];
  companySizes?: string[];
  signalKinds?: string[];
  eventWindowDays?: number | null;
};

export type ParsedBrief = {
  structured: {
    keywords: string;
    countries: string[];
    industries: string[];
    companySizes: string[];
    signalKinds: string[];
    eventWindowDays: number | null;
  };
  unsupported: string[];
  usage: { quotaMonthly: number; usedMonthly: number };
};

export function parseBrief(workspaceId: string, brief: string) {
  return api<ParsedBrief>(`/v1/workspaces/${workspaceId}/research-runs/parse-brief`, {
    method: "POST",
    body: JSON.stringify({ brief }),
  });
}

export function startResearchRun(
  workspaceId: string,
  body: {
    mode: "account" | "discovery";
    query: string;
    brief?: string;
    filters?: ResearchFilters;
    accountId?: string;
    playbookVersionId?: string;
    budget?: number;
    idempotencyKey?: string;
  },
) {
  return api<{ researchRunId: string; status: string; reused?: boolean }>(
    `/v1/workspaces/${workspaceId}/research-runs`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export type ResearchRun = {
  id: string;
  mode: string;
  status: string;
  progressPct: number;
  errorCode: string | null;
  errorMessage: string | null;
  budgetReserved: number;
  budgetActual: number | null;
  accountId: string | null;
  result: {
    noResults?: boolean;
    evidenceCreated?: number;
    duplicatesSkipped?: number;
    rows?: DiscoveryRow[];
    unmatched?: number;
    skippedSuppressed?: number;
  } | null;
};

/** One company found by a discovery search, with its latest trigger */
export type DiscoveryRow = {
  accountId: string;
  name: string;
  domain: string | null;
  country: string | null;
  isNew: boolean;
  identityNeedsReview: boolean;
  trigger: { title: string | null; summary: string | null; eventDate: string | null; url: string };
  sources: number;
  fitScore: number | null;
};

export function getResearchRun(id: string, workspaceId: string) {
  return api<{ researchRun: ResearchRun }>(`/v1/research-runs/${id}?workspaceId=${workspaceId}`);
}

export type ResearchRunSummary = {
  id: string;
  mode: "account" | "discovery";
  status: string;
  brief: string | null;
  query: string;
  accountId: string | null;
  companies: number | null;
  createdAt: string;
  completedAt: string | null;
};

export function listResearchRuns(
  workspaceId: string,
  opts: { mode?: "account" | "discovery"; accountId?: string; limit?: number } = {},
) {
  const qs = new URLSearchParams(
    Object.entries(opts)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  return api<{ runs: ResearchRunSummary[] }>(`/v1/workspaces/${workspaceId}/research-runs${qs.size ? `?${qs}` : ""}`);
}

export function deleteResearchRun(workspaceId: string, id: string) {
  return api<{ ok: boolean }>(`/v1/workspaces/${workspaceId}/research-runs/${id}`, {
    method: "DELETE",
  });
}
