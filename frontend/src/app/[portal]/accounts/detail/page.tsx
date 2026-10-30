"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RequireCap } from "@/components/common/RequireCap";
import { EvidenceList } from "@/components/research/EvidenceList";
import { ScoreBreakdown } from "@/components/research/ScoreBreakdown";
import { AcceptanceActions } from "@/components/qualification/AcceptanceActions";
import { ResearchRunStatus } from "@/components/research/ResearchRunStatus";
import { HandoffPanel } from "@/components/handoffs/HandoffPanel";
import { OpportunityPanel } from "@/components/accounts/OpportunityPanel";
import { PeoplePanel } from "@/components/accounts/PeoplePanel";
import { CrmSyncPanel } from "@/components/accounts/CrmSyncPanel";
import { TaskForm } from "@/components/tasks/TaskForm";
import { TaskQueue } from "@/components/tasks/TaskQueue";
import { usePortal } from "@/hooks/usePortal";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getBrief, listPeople, type Brief } from "@/lib/api/accounts";
import { listTasks, patchTask, type Task } from "@/lib/api/tasks";
import { listResearchRuns, startResearchRun } from "@/lib/api/research";
import { createDraft, listDrafts, type Draft } from "@/lib/api/drafts";
import { LeadProgress, type LeadStep } from "@/components/accounts/LeadProgress";
import { formatDate } from "@/lib/utils/dates";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormNotice } from "@/components/ui/Field";

/** Pre-select this account in a guided flow (guides keep their choice under these keys). */
function rememberGuideAccount(
  userId: string | undefined,
  workspaceId: string,
  guide: "qualify" | "review" | "crm",
  accountId: string,
  step = 1,
) {
  // Same per-user keys usePersistentState reads
  const scope = userId ?? "anon";
  try {
    localStorage.setItem(`signal:${scope}:${workspaceId}:${guide}:account`, JSON.stringify(accountId));
    localStorage.setItem(`signal:${scope}:guide:${workspaceId}:${guide}:step`, JSON.stringify(step));
  } catch {
    // storage unavailable: the guide simply starts at step 1
  }
}

function AccountBrief({ workspaceId, accountId }: { workspaceId: string; accountId: string }) {
  const { can, user } = useWorkspace();
  const { href: portalHref } = usePortal();
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [peopleNames, setPeopleNames] = useState<Map<string, string>>(new Map());
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    if (!can("view_drafts")) return;
    void listDrafts(workspaceId, accountId)
      .then((r) => setDrafts(r.drafts))
      .catch(() => setDrafts([]));
  }, [workspaceId, accountId, can]);

  const refreshTasks = useCallback(async () => {
    if (!can("view_tasks")) return;
    try {
      setTasks((await listTasks(workspaceId, { accountId })).tasks);
    } catch {
      setTasks([]);
    }
  }, [workspaceId, accountId, can]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);
  useEffect(() => {
    void listPeople(workspaceId)
      .then((r) => setPeopleNames(new Map(r.people.map((p) => [p.userId, p.name]))))
      .catch(() => setPeopleNames(new Map()));
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    try {
      setBrief(await getBrief(accountId, workspaceId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load account");
    }
  }, [accountId, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // After a refresh, show the progress of research that is still running
  useEffect(() => {
    void listResearchRuns(workspaceId, { accountId, limit: 1 })
      .then(({ runs }) => {
        const latest = runs[0];
        if (latest && ["queued", "running", "retrying"].includes(latest.status)) setRunId(latest.id);
      })
      .catch(() => undefined);
  }, [workspaceId, accountId]);

  if (loadError) return <ErrorState message={loadError} />;
  if (!brief) return <LoadingState label="Loading brief…" />;

  const { account } = brief;
  const reviewed = brief.evidence.filter((e) => e.reviewedAt).length;

  async function runResearch() {
    setLocalError(null);
    try {
      const { researchRunId } = await startResearchRun(workspaceId, {
        mode: "account",
        query: "infrastructure expansion, hiring, refresh or procurement",
        accountId,
        budget: 3,
      });
      setRunId(researchRunId);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Research failed");
    }
  }

  async function newDraft() {
    setLocalError(null);
    try {
      await createDraft(accountId, workspaceId);
      router.push(portalHref(`/outreach/drafts?account=${accountId}`));
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not create draft");
    }
  }

  // --- Lead progress: every step, its status and its action ---
  const state = account.acceptanceState;
  const editable = state === "draft" || state === "needs_research";
  const knownFacts = brief.facts.filter((f) => f.basis !== "unknown").length;
  const rationale = brief.qualification?.rationale?.trim();
  const decisions = [...brief.decisions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const lastTo = (to: string) => decisions.find((d) => d.toState === to);
  const sent = lastTo("ready_for_review");
  const decided = decisions.find((d) => ["accepted", "rejected", "needs_research"].includes(d.toState) && d !== sent);
  const pendingDrafts = drafts.filter((d) => !d.approvedAt);
  const approvedDrafts = drafts.filter((d) => d.approvedAt);
  const actionLink = "text-sm font-semibold text-[var(--red-active)] hover:underline";
  const guide = (to: "qualify" | "review" | "crm", step: number) => () =>
    rememberGuideAccount(user?.id, workspaceId, to, accountId, step);

  const steps: LeadStep[] = [
    {
      key: "research",
      title: "Research the company",
      done: account.researchState === "researched",
      status:
        account.researchState === "researching"
          ? "Research is running…"
          : account.researchState === "researched"
            ? `Researched · ${brief.evidence.length} source${brief.evidence.length === 1 ? "" : "s"} found`
            : "Not researched yet",
      actions: can("research") ? (
        <Button disabled={account.researchState === "researching"} onClick={() => void runResearch()}>
          {account.researchState === "unresearched" ? "Run research" : "Re-research"}
        </Button>
      ) : null,
    },
    {
      key: "evidence",
      title: "Check the evidence",
      done: reviewed > 0,
      status: brief.evidence.length
        ? `${reviewed} of ${brief.evidence.length} source${brief.evidence.length === 1 ? "" : "s"} reviewed`
        : "No evidence yet. Run research first.",
      actions: brief.evidence.length ? (
        <a href="#evidence-heading" className={actionLink}>
          Review evidence ↓
        </a>
      ) : null,
    },
    {
      key: "qualify",
      title: "Qualification brief",
      done: Boolean(rationale) && knownFacts > 0,
      status: `${knownFacts} brief fact${knownFacts === 1 ? "" : "s"} filled in · rationale ${rationale ? "written" : "not written yet"}`,
      actions: (
        <>
          <Link href={`/accounts/qualification?id=${accountId}`}>
            <Button>Open qualification</Button>
          </Link>
          {editable && can("qualify") && can("submit_review") ? (
            <Link href="/accounts/qualify" onClick={guide("qualify", 2)} className={actionLink}>
              Step by step →
            </Link>
          ) : null}
        </>
      ),
    },
    {
      key: "send",
      title: "Send for sales review",
      done: !editable,
      status:
        state === "draft"
          ? "Not sent yet"
          : state === "needs_research"
            ? "Returned by the reviewer. Fix what they asked, then send it again."
            : sent
              ? `Sent by ${sent.actorName} on ${formatDate(sent.createdAt)}`
              : "Sent for review",
      actions:
        editable && can("qualify") && can("submit_review") ? (
          <Link href="/accounts/qualify" onClick={guide("qualify", 4)}>
            <Button variant="primary">Send for review →</Button>
          </Link>
        ) : null,
    },
    {
      key: "decision",
      title: "Sales decision",
      done: state === "accepted" || state === "rejected",
      status:
        state === "ready_for_review"
          ? "Waiting for a sales reviewer"
          : state === "accepted" || state === "rejected" || state === "needs_research"
            ? `${state === "accepted" ? "Accepted" : state === "rejected" ? "Rejected" : "Returned"}${
                decided ? ` by ${decided.actorName} on ${formatDate(decided.createdAt)}` : ""
              }${decided?.reasonDetail ? `: ${decided.reasonDetail}` : ""}`
            : "Not sent yet",
      actions: (
        <>
          {can("accept") && state === "ready_for_review" ? (
            <Link href="/accounts/review" onClick={guide("review", 1)}>
              <Button variant="primary">Review this brief →</Button>
            </Link>
          ) : null}
          <a href="#decision" className={actionLink}>
            Details ↓
          </a>
        </>
      ),
    },
    {
      key: "drafts",
      title: "Draft outreach",
      done: drafts.length > 0,
      status: drafts.length
        ? `${pendingDrafts.length} draft${pendingDrafts.length === 1 ? "" : "s"} waiting for approval`
        : "No drafts yet. Drafts use only reviewed evidence and never send anything.",
      actions: (
        <>
          {can("drafts") ? <Button onClick={() => void newDraft()}>Create draft</Button> : null}
          {pendingDrafts.length ? (
            <Link href={`/outreach/drafts?account=${accountId}`} className={actionLink}>
              Open drafts →
            </Link>
          ) : null}
        </>
      ),
    },
    {
      key: "approved",
      title: "Approved drafts",
      done: approvedDrafts.length > 0,
      status: approvedDrafts.length
        ? `${approvedDrafts.length} approved, ready to use`
        : "None approved yet. Approve a draft after checking it.",
      actions: approvedDrafts.length ? (
        <Link href={`/outreach/drafts?tab=approved&account=${accountId}`} className={actionLink}>
          Open approved →
        </Link>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <PageHeader
        eyebrow="Account brief"
        title={account.name}
        description={[account.domain, account.country, account.legalName].filter(Boolean).join(" · ") || "No domain"}
        actions={
          <>
            <Link href={`/accounts/qualification?id=${accountId}`}>
              <Button>Qualification</Button>
            </Link>
            {can("research") ? (
              <Button
                variant="primary"
                disabled={account.researchState === "researching"}
                onClick={() => void runResearch()}
              >
                {account.researchState === "unresearched" ? "Run research" : "Re-research"}
              </Button>
            ) : null}
            {can("drafts") ? (
              <Button onClick={() => void newDraft()}>
                Draft outreach
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="!py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={account.researchState} />
          <StatusBadge status={account.acceptanceState} />
          <span className="text-[var(--muted)]">Priority {account.fitScore ?? "—"} / 100</span>
          <span className="text-[var(--muted)]">· Owner {brief.owner?.name ?? "unassigned"}</span>
          <span className="text-[var(--muted)]">· Added via {account.source}</span>
        </div>
      </Card>

      <LeadProgress
        steps={steps}
        footer={
          <>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Also</span>
            {can("tasks") ? (
              <Link href="/outreach/work" className={actionLink}>
                Work my tasks →
              </Link>
            ) : null}
            {can("manage_integrations") && state === "accepted" ? (
              <Link href="/accounts/crm" onClick={guide("crm", 1)} className={actionLink}>
                Send to CRM →
              </Link>
            ) : null}
            <a href="#tasks-heading" className={actionLink}>
              Tasks on this account ({tasks.length}) ↓
            </a>
          </>
        }
      />

      {localError ? <ErrorState message={localError} /> : null}
      <ResearchRunStatus runId={runId} workspaceId={workspaceId} onFinished={() => void refresh()} />
      <ScoreBreakdown signals={brief.signals} />

      <section aria-labelledby="evidence-heading">
        <h2 id="evidence-heading" className="mb-1 scroll-mt-24 text-[16px]">
          Cited evidence
        </h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Sources are untrusted web data. Review each item before relying on it; only reviewed evidence counts for
          acceptance and drafts. Stale = outside the {brief.eventWindowDays}-day event window or not re-checked
          recently.
        </p>
        <EvidenceList items={brief.evidence} workspaceId={workspaceId} canReview={can("review_evidence")} onChanged={refresh} />
      </section>

      <PeoplePanel accountId={accountId} workspaceId={workspaceId} evidence={brief.evidence} />

      <div id="decision" className="scroll-mt-24" />
      <AcceptanceActions
        accountId={accountId}
        workspaceId={workspaceId}
        state={account.acceptanceState}
        version={account.version}
        currentOwnerId={account.ownerUserId}
        reviewedEvidenceCount={reviewed}
        decisions={brief.decisions}
        onDone={refresh}
      />

      <OpportunityPanel accountId={accountId} workspaceId={workspaceId} />

      <CrmSyncPanel accountId={accountId} workspaceId={workspaceId} acceptanceState={account.acceptanceState} />

      {can("tasks") ? (
        <div>
          <Button
            onClick={() => {
              setTaskNotice(null);
              setShowTaskForm((s) => !s);
            }}
          >
            {showTaskForm ? "Hide task form" : "Add a task for this account"}
          </Button>
          {showTaskForm ? (
            <div className="mt-3">
              <TaskForm
                workspaceId={workspaceId}
                accountId={accountId}
                onCreated={(message) => {
                  setShowTaskForm(false);
                  setTaskNotice(message);
                  void refreshTasks();
                }}
              />
            </div>
          ) : null}
          <FormNotice message={taskNotice} />
        </div>
      ) : null}

      {tasks.length ? (
        <section aria-labelledby="tasks-heading">
          <h2 id="tasks-heading" className="mb-3 text-[16px]">
            Tasks on this account
          </h2>
          <TaskQueue
            tasks={tasks}
            accountNames={new Map([[accountId, account.name]])}
            accounts={new Map([[accountId, account]])}
            peopleNames={peopleNames}
            canEdit={can("tasks")}
            onUpdate={async (taskId, body) => {
              await patchTask(taskId, { workspaceId, ...body });
              await refreshTasks();
            }}
            workspaceId={workspaceId}
            onAccountChanged={() => {
              void refresh();
              void refreshTasks();
            }}
            onSent={(message) => setTaskNotice(message)}
          />
        </section>
      ) : null}

      {can("handoff") ? (
        <HandoffPanel accountId={accountId} workspaceId={workspaceId} acceptanceState={account.acceptanceState} />
      ) : null}
    </div>
  );
}

export default function AccountBriefPage() {
  const accountId = useSearchParams().get("id") ?? "";
  return (
    <RequireCap cap="view_accounts">
      {(workspaceId) => <AccountBrief workspaceId={workspaceId} accountId={accountId} />}
    </RequireCap>
  );
}
