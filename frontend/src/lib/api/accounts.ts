import { api, API_URL, ApiError } from "./client";

export type Account = {
  id: string;
  name: string;
  domain: string | null;
  country: string | null;
  source: string;
  researchState: string;
  acceptanceState: string;
  fitScore: number | null;
  ownerUserId: string | null;
  version: number;
  updatedAt: string;
  /** Set by the account list: at least one evidence item carries an event date */
  hasDatedEvidence?: boolean;
};

export type EvidenceItem = {
  id: string;
  excerpt: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
  publisher: string | null;
  sourceCountry: string | null;
  eventDate: string | null;
  discoveredAt: string;
  checkedAt: string;
  matchRationale: string | null;
  providerRequestRef: string | null;
  extractionVersion: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  freshness: "fresh" | "stale" | "date_unknown";
  contradiction: boolean;
};

export type Signal = {
  id: string;
  evidenceId: string | null;
  kind: string;
  observedFact: string | null;
  hypothesis: string | null;
  unknownNote: string | null;
  fitComponent: number | null;
  recencyComponent: number | null;
  qualityComponent: number | null;
};

export type Fact = {
  id: string;
  fieldKey: string;
  value: string | null;
  basis: string;
  evidenceIdsJson: string;
  confirmationNote: string | null;
  confirmerUserId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  supersededBy: string | null;
};

export type Decision = {
  id: string;
  fromState: string;
  toState: string;
  reasonCategory: string | null;
  reasonDetail: string | null;
  briefVersion: string | null;
  nextAction: string | null;
  ownerUserId: string | null;
  actorName: string;
  createdAt: string;
};

export type Brief = {
  account: Account & { legalName: string | null };
  owner: { id: string; name: string } | null;
  eventWindowDays: number;
  evidence: EvidenceItem[];
  signals: Signal[];
  qualification: { id: string; version: number; rationale: string | null } | null;
  facts: Fact[];
  decisions: Decision[];
};

export type MergeCandidate = {
  id: string;
  reason: string;
  accountIdA: string;
  accountIdB: string;
  accountA?: { id: string; name: string; domain: string | null; country: string | null };
  accountB?: { id: string; name: string; domain: string | null; country: string | null };
};

export function listAccounts(
  workspaceId: string,
  filters: { acceptanceState?: string; researchState?: string; ownerUserId?: string } = {},
) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
  return api<{ accounts: Account[] }>(
    `/v1/workspaces/${workspaceId}/accounts${qs.size ? `?${qs}` : ""}`,
  );
}

export type PipelineRow = {
  accountId: string;
  name: string;
  acceptanceState: string;
  owner: { id: string; name: string } | null;
  nextAction: string | null;
  taskType: "research" | "review" | "call" | "email" | "follow_up" | null;
  dueAt: string | null;
};

export function getPipeline(workspaceId: string) {
  return api<{ rows: PipelineRow[] }>(`/v1/workspaces/${workspaceId}/pipeline`);
}

export function createAccount(
  workspaceId: string,
  body: { name: string; domain?: string; country?: string },
) {
  return api<{ account: Account }>(`/v1/workspaces/${workspaceId}/accounts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ImportPreview = {
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  sampleRows: Array<Record<string, string>>;
  rowCount: number;
  maxRows: number;
  errors: string[];
};

export function previewImport(workspaceId: string, csvText: string) {
  return api<ImportPreview>(`/v1/workspaces/${workspaceId}/imports/preview`, {
    method: "POST",
    body: JSON.stringify({ csvText }),
  });
}

export function startImport(workspaceId: string, csvText: string, mapping: Record<string, string>) {
  return api<{ importJobId: string; status: string }>(`/v1/workspaces/${workspaceId}/imports`, {
    method: "POST",
    body: JSON.stringify({ csvText, mapping }),
  });
}

export function getImport(importJobId: string, workspaceId: string) {
  return api<{
    import: {
      id: string;
      status: string;
      totalRows: number;
      successRows: number;
      errorRows: number;
      rowErrors: string[];
    };
  }>(`/v1/imports/${importJobId}?workspaceId=${workspaceId}`);
}

export function getBrief(accountId: string, workspaceId: string) {
  return api<Brief>(`/v1/accounts/${accountId}/brief?workspaceId=${workspaceId}`);
}

export function reviewEvidence(evidenceId: string, workspaceId: string, reviewed: boolean) {
  return api<{ evidence: EvidenceItem }>(`/v1/evidence/${evidenceId}/review`, {
    method: "POST",
    body: JSON.stringify({ workspaceId, reviewed }),
  });
}

export function listMergeCandidates(workspaceId: string) {
  return api<{ candidates: MergeCandidate[] }>(`/v1/workspaces/${workspaceId}/merge-candidates`);
}

export function resolveMergeCandidate(
  workspaceId: string,
  candidateId: string,
  body: { action: "merge" | "keep_separate" | "reject"; keepAccountId?: string },
) {
  return api<{ status: string }>(
    `/v1/workspaces/${workspaceId}/merge-candidates/${candidateId}/resolve`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function transitionAcceptance(
  accountId: string,
  workspaceId: string,
  body: {
    toState: string;
    reasonCategory?: string;
    reasonDetail?: string;
    nextAction?: string;
    ownerUserId?: string;
    expectedVersion?: number;
  },
) {
  return api<{ fromState: string; toState: string; version: number }>(
    `/v1/accounts/${accountId}/acceptance-decisions?workspaceId=${workspaceId}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function listPeople(workspaceId: string) {
  return api<{ people: Array<{ userId: string; name: string; email: string; role: string }> }>(
    `/v1/workspaces/${workspaceId}/people`,
  );
}

/** Download a file from an authenticated endpoint (CSV/TXT exports). */
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).error?.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, "download_failed", message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ImportJob = {
  id: string;
  status: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  rowErrors: string[];
  createdAt: string;
  completedAt: string | null;
};

export function listImports(workspaceId: string) {
  return api<{ imports: ImportJob[] }>(`/v1/workspaces/${workspaceId}/imports`);
}
