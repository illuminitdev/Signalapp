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
import { createDraft } from "@/lib/api/drafts";
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
) {
  // Same per-user keys usePersistentState reads
  const scope = userId ?? "anon";
  try {
    localStorage.setItem(`signal:${scope}:${workspaceId}:${guide}:account`, JSON.stringify(accountId));
    localStorage.setItem(`signal:${scope}:guide:${workspaceId}:${guide}:step`, JSON.stringify(1));
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
                onClick={async () => {
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
                }}
              >
                {account.researchState === "unresearched" ? "Run research" : "Re-research"}
              </Button>
            ) : null}
            {can("drafts") ? (
              <Button
                onClick={async () => {
                  setLocalError(null);
                  try {
                    await createDraft(accountId, workspaceId);
                    router.push(portalHref("/outreach/drafts"));
                  } catch (e) {
                    setLocalError(e instanceof Error ? e.message : "Could not create draft");
                  }
                }}
              >
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
        {/* Step-by-step versions of the main jobs on this account */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] pt-2.5 text-xs">
          <span className="font-semibold uppercase tracking-wide text-[var(--muted)]">Guided</span>
          {can("qualify") && can("submit_review") && ["draft", "needs_research"].includes(account.acceptanceState) ? (
            <Link href="/accounts/qualify" onClick={() => rememberGuideAccount(user?.id, workspaceId, "qualify", accountId)} className="font-medium text-[var(--red-active)] hover:underline">
              Qualify this lead →
            </Link>
          ) : null}
          {can("accept") && account.acceptanceState === "ready_for_review" ? (
            <Link href="/accounts/review" onClick={() => rememberGuideAccount(user?.id, workspaceId, "review", accountId)} className="font-medium text-[var(--red-active)] hover:underline">
              Review this brief →
            </Link>
          ) : null}
          {can("manage_integrations") && account.acceptanceState === "accepted" ? (
            <Link href="/accounts/crm" onClick={() => rememberGuideAccount(user?.id, workspaceId, "crm", accountId)} className="font-medium text-[var(--red-active)] hover:underline">
              Send to CRM →
            </Link>
          ) : null}
          {can("tasks") ? (
            <Link href="/outreach/work" className="font-medium text-[var(--red-active)] hover:underline">
              Work my tasks →
            </Link>
          ) : null}
        </div>
      </Card>

      {localError ? <ErrorState message={localError} /> : null}
      <ResearchRunStatus runId={runId} workspaceId={workspaceId} onFinished={() => void refresh()} />
      <ScoreBreakdown signals={brief.signals} />

      <section aria-labelledby="evidence-heading">
        <h2 id="evidence-heading" className="mb-1 text-[16px]">
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
