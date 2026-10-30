"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useEffect, useState } from "react";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  getOutcomes,
  type AdminReport,
  type Outcomes,
  type ResearcherReport,
  type ReviewerReport,
  type SdrReport,
  type WorkspaceOutcomes,
} from "@/lib/api/settings";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { humanize } from "@/components/ui/Field";
import { ROLE_LABELS } from "@/lib/auth/capabilities";
import { formatMoney } from "@/lib/api/opportunities";
import { formatDate } from "@/lib/utils/dates";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ExternalLink } from "lucide-react";

// The pilot report covers every event recorded, not a rolling window
const PILOT_START = new Date("2000-01-01T00:00:00Z").toISOString();

const VIEW_TITLES: Record<Outcomes["view"], { title: string; description: string }> = {
  admin: {
    title: "Workspace report",
    description: "Everything happening in this workspace: team activity and outcomes. Research usage is under Settings → Usage.",
  },
  researcher: {
    title: "Your research",
    description: "The research you ran, the evidence you reviewed and what happened to the briefs you submitted.",
  },
  reviewer: {
    title: "Your review decisions",
    description: "The briefs you accepted, returned or rejected, what is waiting for review and the handoffs you prepared.",
  },
  sdr: {
    title: "Your work queue",
    description: "Your own tasks and assigned accounts only.",
  },
  analyst: {
    title: "Workspace outcomes",
    description: "Read-only outcome metrics with their cohort, denominators and date basis.",
  },
};

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function StatTile({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string | number;
  caption: string;
  tone?: "alert" | "good";
}) {
  const valueTone =
    tone === "alert" ? "text-[var(--red-active)]" : tone === "good" ? "text-[var(--badge-green-fg)]" : "text-[var(--foreground)]";
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-white px-5 py-5">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className={`mt-3 text-[28px] font-semibold leading-none tabular-nums ${valueTone}`}>{value}</p>
      <p className="mt-3 text-xs text-[var(--muted)]">{caption}</p>
    </div>
  );
}

/** Horizontal bars for a label → count breakdown. */
function BarList({ data, empty, tone = "navy" }: { data: Record<string, number>; empty: string; tone?: "navy" | "red" }) {
  const rows = Object.entries(data)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--muted)]">{empty}</p>;
  return (
    <ul className="mt-4 space-y-3">
      {rows.map(([key, n]) => (
        <li key={key}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{humanize(key)}</span>
            <span className="tabular-nums text-[var(--muted)]">{n}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--chip-bg)]" aria-hidden>
            <div
              className={`h-full rounded-full ${tone === "red" ? "bg-[var(--red)]" : "bg-[var(--navy)]"}`}
              style={{ width: `${(n / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-[16px]">{title}</h2>
      {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      {children}
    </Card>
  );
}

/* ---------- Workspace-wide (admin, analyst; compact for researcher/reviewer) ---------- */

function WorkspaceAtAGlance({ w }: { w: WorkspaceOutcomes }) {
  const decided = w.denominators.accountsWithReviewerDecision;
  return (
    <SectionCard title="Workspace at a glance" description="Team-wide totals for context.">
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <StatTile label="Sales-accepted briefs" value={w.metrics.explicitSalesAccepted} caption="Latest decision is Accepted" />
        <StatTile
          label="Acceptance rate"
          value={pct(w.metrics.acceptanceRate)}
          caption={`of ${decided} account${decided === 1 ? "" : "s"} with a reviewer decision`}
        />
        <StatTile label="Open SDR tasks" value={w.metrics.openSdrTasks} caption="Across the whole team, right now" />
      </div>
    </SectionCard>
  );
}

function WorkspaceFull({ w }: { w: WorkspaceOutcomes }) {
  const m = w.metrics;
  const decided = w.denominators.accountsWithReviewerDecision;
  const rq = w.breakdowns.researchQuality;
  return (
    <>
      <SectionCard title="Sales acceptance" description="Each account counts once, by its latest reviewer decision.">
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <StatTile label="Accepted" value={m.explicitSalesAccepted} caption="Explicit acceptance decisions" tone="good" />
          <StatTile label="Returned for research" value={m.returnedDecisions} caption="Sent back to the researcher" />
          <StatTile label="Rejected" value={m.rejectedDecisions} caption="Not worth sales time" />
          <StatTile
            label="Acceptance rate"
            value={pct(m.acceptanceRate)}
            caption={`Denominator: ${decided} account${decided === 1 ? "" : "s"} with a reviewer decision`}
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Research quality" description="How research runs and evidence are holding up.">
          <div className="mt-4 grid grid-cols-2 gap-4">
            <StatTile label="Runs completed" value={rq.runsCompleted ?? 0} caption={`${rq.runsFailed ?? 0} failed · ${rq.runsWithNoResults ?? 0} no results`} />
            <StatTile label="Runs in progress" value={rq.runsQueuedOrRunning ?? 0} caption={`${rq.discoveryRuns ?? 0} discovery searches in total`} />
            <StatTile
              label="Evidence reviewed"
              value={`${rq.evidenceReviewed ?? 0} / ${rq.evidenceDiscovered ?? 0}`}
              caption="Reviewed ÷ discovered sources"
            />
            <StatTile label="Accounts research-reviewed" value={m.uniqueResearchReviewedAccounts} caption="Distinct accounts with reviewed evidence" />
          </div>
        </SectionCard>

        <SectionCard title="Team activity" description="Completed SDR tasks by type. Task completion is an activity count only.">
          <div className="mt-4 grid grid-cols-3 gap-4">
            <StatTile label="Completed" value={m.completedSdrActions} caption="Tasks with an outcome" />
            <StatTile label="Open" value={m.openSdrTasks} caption="Right now" />
            <StatTile label="Cancelled" value={m.cancelledSdrActions} caption="With a reason" />
          </div>
          <BarList data={w.breakdowns.activityByTaskType} empty="No tasks completed yet." />
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Rejection feedback" description="Why accounts did not qualify, by their latest decision.">
          <BarList
            data={w.breakdowns.rejectionReasons}
            tone="red"
            empty="No rejections yet. Reasons recorded on rejected briefs appear here."
          />
        </SectionCard>

        <SectionCard title="Partner handoffs" description="Recorded handoffs and CRM-backed events.">
          <div className="mt-4 grid grid-cols-2 gap-4">
            <StatTile label="Handoffs prepared" value={m.partnerHandoffsPrepared} caption="Recorded, not necessarily shared" />
            <StatTile label="Handoffs shared" value={m.partnerHandoffsShared} caption="Explicitly shared with a partner" />
            <StatTile label="CRM opportunities" value={m.crmOpportunities ?? "Not connected"} caption="Synced from a CRM" />
            <StatTile label="Meetings" value={m.meetings ?? "Not connected"} caption="Only from CRM or recorded events" />
          </div>
        </SectionCard>
      </div>

      {m.opportunities ? <OpportunitiesCard w={w} /> : null}
    </>
  );
}

/** Deal pipeline from opportunity records: separate from acceptance, values user-entered. */
function OpportunitiesCard({ w }: { w: WorkspaceOutcomes }) {
  const o = w.metrics.opportunities;
  return (
    <SectionCard
      title="Opportunity pipeline"
      description={`Deal stages recorded by the team, separate from sales acceptance. Values are ${
        o.source === "user_entered" ? "entered by users" : "entered by users or synced from a CRM"
      }, in ${w.currency}.`}
    >
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <StatTile label="Open deals" value={o.open} caption={o.openWithoutValue ? `${o.openWithoutValue} without a value yet` : "All have a value"} />
        <StatTile label="Open value" value={formatMoney(o.openValue, w.currency)} caption="Sum of open deals with a value" />
        <StatTile label="Won" value={o.won} caption={formatMoney(o.wonValue, w.currency)} tone={o.won ? "good" : undefined} />
        <StatTile label="Lost" value={o.lost} caption="With a recorded reason" />
      </div>
      <BarList data={w.breakdowns.opportunityStages ?? {}} empty="No deals recorded yet. Record one from an account or the pipeline." />
      {o.otherCurrency ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          {o.otherCurrency} deal{o.otherCurrency === 1 ? " is" : "s are"} in another currency and not included in the totals.
        </p>
      ) : null}
    </SectionCard>
  );
}

/* ---------- Role sections ---------- */

function AdminSection({ a }: { a: AdminReport }) {
  return (
    <>
      <SectionCard title="Team activity by person" description="What each member of this workspace has done.">
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr className="border-b border-[var(--line)]">
                <th className="py-2 pr-4 font-semibold">Member</th>
                <th className="py-2 pr-4 text-right font-semibold">Research runs</th>
                <th className="py-2 pr-4 text-right font-semibold">Evidence reviewed</th>
                <th className="py-2 pr-4 text-right font-semibold">Briefs submitted</th>
                <th className="py-2 pr-4 text-right font-semibold">Review decisions</th>
                <th className="py-2 pr-4 text-right font-semibold">Tasks done</th>
                <th className="py-2 text-right font-semibold">Open tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] tabular-nums">
              {a.team.map((p) => (
                <tr key={p.userId}>
                  <td className="py-2.5 pr-4">
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-[var(--muted)]">{p.roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right">{p.researchRuns}</td>
                  <td className="py-2.5 pr-4 text-right">{p.evidenceReviewed}</td>
                  <td className="py-2.5 pr-4 text-right">{p.briefsSubmitted}</td>
                  <td className="py-2.5 pr-4 text-right">{p.reviewerDecisions}</td>
                  <td className="py-2.5 pr-4 text-right">{p.tasksCompleted}</td>
                  <td className="py-2.5 text-right">{p.openTasks}</td>
                </tr>
              ))}
              {!a.team.length ? (
                <tr>
                  <td colSpan={7} className="py-3 text-[var(--muted)]">
                    No members yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

function ResearcherSection({ r }: { r: ResearcherReport }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <StatTile label="Research runs" value={r.researchRuns} caption={`${r.runsCompleted} completed · ${r.runsFailed} failed`} />
        <StatTile label="Companies found" value={r.companiesFound} caption={`From ${r.discoveryRuns} discovery search${r.discoveryRuns === 1 ? "" : "es"}`} />
        <StatTile label="Evidence reviewed" value={r.evidenceReviewed} caption={`Across ${r.accountsWithReviewedEvidence} account${r.accountsWithReviewedEvidence === 1 ? "" : "s"}`} />
        <StatTile label="Briefs submitted" value={r.briefsSubmitted} caption="Sent for sales acceptance" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="What happened to your briefs" description="The latest reviewer decision on each brief you submitted.">
          <div className="mt-4 grid grid-cols-2 gap-4">
            <StatTile label="Accepted" value={r.submittedAccepted} caption="Approved for sales" tone="good" />
            <StatTile label="Awaiting decision" value={r.submittedAwaitingDecision} caption="Still in the review queue" />
            <StatTile label="Returned" value={r.submittedReturned} caption="Needs more research" tone={r.submittedReturned ? "alert" : undefined} />
            <StatTile label="Rejected" value={r.submittedRejected} caption="Not worth sales time" />
          </div>
        </SectionCard>

        <SectionCard title="Why briefs came back" description="Reasons on returned or rejected briefs. Use them to sharpen research.">
          <BarList data={r.returnReasons} tone="red" empty="None of your briefs have been returned or rejected." />
          {r.runsWithNoResults ? (
            <p className="mt-4 text-xs text-[var(--muted)]">
              {r.runsWithNoResults} of your runs found no results. Try a broader brief or a longer event window.
            </p>
          ) : null}
        </SectionCard>
      </div>

      <div className="print:hidden">
        <Link href="/discover/assign">
          <Button>Start a new search</Button>
        </Link>
      </div>
    </>
  );
}

function ReviewerSection({ r }: { r: ReviewerReport }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <StatTile
          label="Waiting for review"
          value={r.queueWaiting}
          caption={r.oldestWaitingDays == null ? "Queue is empty" : `Oldest waiting ${r.oldestWaitingDays} day${r.oldestWaitingDays === 1 ? "" : "s"}`}
          tone={r.queueWaiting ? "alert" : "good"}
        />
        <StatTile label="Accounts you decided" value={r.accountsDecided} caption={`${r.decisionEvents} decision event${r.decisionEvents === 1 ? "" : "s"} in total`} />
        <StatTile
          label="Your acceptance rate"
          value={pct(r.acceptanceRate)}
          caption={`${r.accepted} accepted of ${r.accountsDecided} decided`}
        />
        <StatTile label="Handoffs prepared" value={r.handoffsPrepared} caption="Recorded by you" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Your decisions" description="Each account counts once, by your latest decision on it.">
          <div className="mt-4 grid grid-cols-3 gap-4">
            <StatTile label="Accepted" value={r.accepted} caption="Approved" tone="good" />
            <StatTile label="Returned" value={r.returned} caption="Needs research" />
            <StatTile label="Rejected" value={r.rejected} caption="Not qualified" />
          </div>
          <BarList data={r.reasons} tone="red" empty="No returned or rejected briefs yet." />
        </SectionCard>

        <SectionCard title="Your handoffs" description="Partner handoffs you prepared, by current state.">
          <BarList data={r.handoffsByState} empty="You have not prepared any partner handoffs yet." />
        </SectionCard>
      </div>

      <div className="print:hidden">
        <Link href="/accounts/sales-acceptance">
          <Button>Open the review queue</Button>
        </Link>
      </div>
    </>
  );
}

function SdrSection({ s }: { s: SdrReport }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <StatTile label="Open tasks" value={s.openTasks} caption={`${s.inProgressTasks} in progress`} />
        <StatTile label="Overdue" value={s.overdueTasks} caption="Past their due date" tone={s.overdueTasks ? "alert" : "good"} />
        <StatTile label="Due in the next 24h" value={s.dueToday} caption="Plan these first" />
        <StatTile label="Completed" value={s.completedTasks} caption={`${s.cancelledTasks} cancelled`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Completed by type" description="Your completed tasks. Completion never changes pipeline stage.">
          <BarList data={s.completedByType} empty="You have not completed any tasks yet." />
        </SectionCard>

        <SectionCard title="Your accounts" description="Accounts you own or have tasks on.">
          <div className="mt-4 grid grid-cols-3 gap-4">
            <StatTile label="Assigned to you" value={s.assignedAccounts} caption="You are the owner" />
            <StatTile label="Sales-accepted" value={s.acceptedAssignedAccounts} caption="Of your assigned accounts" tone="good" />
            <StatTile label="With your tasks" value={s.accountsWithMyTasks} caption="Any task owned by you" />
          </div>
        </SectionCard>
      </div>

      <div className="print:hidden">
        <Link href="/outreach/tasks">
          <Button>Go to my tasks</Button>
        </Link>
      </div>
    </>
  );
}

/* ---------- Page ---------- */

function hasWorkspace(o: Outcomes): o is Outcomes & WorkspaceOutcomes {
  return o.metrics != null && o.breakdowns != null && o.denominators != null;
}

function OutcomesView({ workspaceId }: { workspaceId: string }) {
  const { workspaceName, user } = useWorkspace();
  const [data, setData] = useState<Outcomes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOutcomes(workspaceId, PILOT_START, new Date().toISOString())
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the report"));
  }, [workspaceId]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const { title, description } = VIEW_TITLES[data.view] ?? VIEW_TITLES.analyst;
  const ws = hasWorkspace(data) ? data : null;

  return (
    <div className="max-w-[1100px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Reports</Eyebrow>
          <h1 className="text-[var(--foreground)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            All recorded events · {data.cohort.dateBasis} · {data.cohort.decisionRule}
          </p>
          {/* Only on the exported PDF: who it is for and when it was generated */}
          <p className="mt-1 hidden text-xs text-[var(--muted)] print:block">
            {[workspaceName, user?.name, `Generated ${formatDate(new Date().toISOString())}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button
          className="shrink-0 print:hidden"
          title="Export this report as a PDF"
          onClick={() => {
            // The browser's print dialog saves as PDF; the title becomes the default file name
            const previous = document.title;
            const day = new Date().toISOString().slice(0, 10);
            document.title = [title, workspaceName, day].filter(Boolean).join(" - ");
            window.addEventListener("afterprint", () => (document.title = previous), { once: true });
            window.print();
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <ExternalLink size={16} aria-hidden />
            Export
          </span>
        </Button>
      </div>

      {data.view === "admin" && data.admin ? <AdminSection a={data.admin} /> : null}
      {data.view === "researcher" && data.researcher ? <ResearcherSection r={data.researcher} /> : null}
      {data.view === "reviewer" && data.reviewer ? <ReviewerSection r={data.reviewer} /> : null}
      {data.view === "sdr" && data.sdr ? <SdrSection s={data.sdr} /> : null}

      {ws && (data.view === "admin" || data.view === "analyst") ? <WorkspaceFull w={ws} /> : null}
      {ws && (data.view === "researcher" || data.view === "reviewer") ? <WorkspaceAtAGlance w={ws} /> : null}

      {ws && data.view === "analyst" && ws.notes.length ? (
        <SectionCard title="How these numbers are calculated">
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-[var(--muted)]">
            {ws.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default function OutcomesPage() {
  return <RequireCap cap="view_outcomes">{(workspaceId) => <OutcomesView workspaceId={workspaceId} />}</RequireCap>;
}
