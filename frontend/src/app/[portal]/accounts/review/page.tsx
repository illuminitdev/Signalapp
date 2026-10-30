"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { RequireCap } from "@/components/common/RequireCap";
import { StatusBadge } from "@/components/common/StatusBadge";
import { GuidedCard } from "@/components/guide/GuidedCard";
import { GuideHeader } from "@/components/guide/GuideHeader";
import { PickList } from "@/components/guide/PickList";
import { Stepper, type GuideStep } from "@/components/guide/Stepper";
import { TourHint } from "@/components/guide/TourHint";
import { AcceptanceActions } from "@/components/qualification/AcceptanceActions";
import { BASIS_LABELS, FIELD_KEYS } from "@/components/qualification/FactEditor";
import { EvidenceList } from "@/components/research/EvidenceList";
import { Button } from "@/components/ui/Button";
import { humanize } from "@/components/ui/Field";
import { useGuidedFlow } from "@/hooks/useGuidedFlow";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getBrief, getPipeline, type Brief, type PipelineRow } from "@/lib/api/accounts";
import { formatDate } from "@/lib/utils/dates";

const STEPS: GuideStep[] = [
  { key: "pick", label: "Pick a brief" },
  { key: "check", label: "Check the brief" },
  { key: "decide", label: "Decide" },
  { key: "done", label: "Done" },
];

const DECISION_TEXT: Record<string, string> = {
  accepted: "Accepted: the owner now sees it in their pipeline with the next action.",
  needs_research: "Returned: it goes back to the researcher with your reason.",
  rejected: "Rejected: kept on record with your reason; nobody will work it.",
};

function ReviewGuide({ workspaceId }: { workspaceId: string }) {
  const { can } = useWorkspace();
  const [accountId, setAccountId] = usePersistentState<string | null>(`${workspaceId}:review:account`, null);
  const [rows, setRows] = useState<PipelineRow[] | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(() => {
    void getPipeline(workspaceId).then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, [workspaceId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const loadBrief = useCallback(async () => {
    if (!accountId) return setBrief(null);
    try {
      setBrief(await getBrief(accountId, workspaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the brief");
    }
  }, [accountId, workspaceId]);

  useEffect(() => {
    void loadBrief();
  }, [loadBrief]);

  const queue = (rows ?? []).filter((r) => r.acceptanceState === "ready_for_review");
  const decided = brief && brief.account.acceptanceState !== "ready_for_review" ? brief.decisions[0] : undefined;
  const reviewed = brief?.evidence.filter((e) => e.reviewedAt).length ?? 0;
  const reachable = decided ? 3 : brief ? 2 : 0;
  const flow = useGuidedFlow(`${workspaceId}:review`, STEPS.length, reachable);
  const name = brief?.account.name ?? "this brief";
  const total = STEPS.length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <GuideHeader
        eyebrow="Guided · Review a brief"
        title="Decide whether a researched lead is worth your sales team's time."
        fullPage={{ href: "/accounts/sales-acceptance", label: "Open the full review queue" }}
      />
      <Stepper steps={STEPS} current={flow.current} reachable={reachable} onSelect={flow.goTo} />

      {flow.current === 0 ? (
        <GuidedCard
          index={0}
          total={total}
          eyebrow="Pick a brief"
          title="Which brief do you want to review?"
          why="These leads were researched and submitted for review. They are waiting for your decision."
          onNext={flow.next}
          nextDisabledReason={brief ? null : "Pick a brief"}
        >
          <TourHint id="review.pick">Oldest first is a good habit, so nobody waits too long.</TourHint>
          {rows === null ? (
            <p className="text-sm text-[var(--muted)]">Loading the queue…</p>
          ) : (
            <PickList
              label="briefs"
              items={queue.map((r) => ({
                id: r.accountId,
                title: r.name,
                badge: <StatusBadge status={r.acceptanceState} />,
                subtitle: r.owner ? `Owner: ${r.owner.name}` : undefined,
              }))}
              selectedId={accountId}
              onSelect={setAccountId}
              empty="The review queue is empty. Nothing is waiting for you."
            />
          )}
        </GuidedCard>
      ) : null}

      {flow.current === 1 && brief ? (
        <GuidedCard
          index={1}
          total={total}
          eyebrow={name}
          title="Check the brief and its evidence"
          why="Read the researcher's rationale, see which facts are backed by a source, and make sure at least one source is reviewed. Acceptance needs reviewed evidence."
          onBack={flow.back}
          onNext={flow.next}
        >
          <TourHint id="review.check">
            Look for facts marked <strong>Unknown</strong> or <strong>Hypothesis</strong>: those are guesses, not proof.
          </TourHint>
          <div className="rounded-[10px] bg-[var(--chip-bg)] px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Researcher&apos;s rationale</p>
            <p className="mt-1 whitespace-pre-wrap">{brief.qualification?.rationale || "No rationale written."}</p>
          </div>
          <table className="mt-5 w-full text-left text-sm">
            <tbody className="divide-y divide-[var(--line)]">
              {FIELD_KEYS.map((k) => {
                const f = brief.facts.find((x) => x.fieldKey === k);
                return (
                  <tr key={k}>
                    <td className="py-2 pr-3 font-medium">{humanize(k)}</td>
                    <td className="py-2 pr-3">{f?.value ?? <span className="text-[var(--muted)]">Unknown</span>}</td>
                    <td className="py-2 text-right text-xs text-[var(--muted)]">{BASIS_LABELS[f?.basis ?? "unknown"]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3 className="mb-2 mt-6 text-[15px]">
            Evidence <span className="font-normal text-[var(--muted)]">({reviewed} of {brief.evidence.length} reviewed)</span>
          </h3>
          <EvidenceList items={brief.evidence} workspaceId={workspaceId} canReview={can("review_evidence")} onChanged={() => void loadBrief()} />
        </GuidedCard>
      ) : null}

      {flow.current === 2 && brief ? (
        <GuidedCard
          index={2}
          total={total}
          eyebrow={name}
          title="Accept, return or reject"
          why="Accept needs an owner and a next action. Return sends it back to the researcher with a reason. Reject closes it with a reason; it's not the same as do-not-contact."
          onBack={flow.back}
          onNext={decided ? flow.next : undefined}
        >
          <TourHint id="review.decide">
            Choosing <strong>Accept</strong>? Pick the SDR who will work it as owner, and write the first thing they should do.
          </TourHint>
          {decided ? (
            <p className="text-sm text-[var(--muted)]">You already decided on this brief. Press Next to see the result.</p>
          ) : (
            <AcceptanceActions
              accountId={brief.account.id}
              workspaceId={workspaceId}
              state={brief.account.acceptanceState}
              version={brief.account.version}
              currentOwnerId={brief.account.ownerUserId}
              reviewedEvidenceCount={reviewed}
              decisions={brief.decisions}
              onDone={async () => {
                await loadBrief();
                loadQueue();
                flow.goTo(3);
              }}
            />
          )}
          <div className="mt-3 text-sm text-[var(--red-active)]">{error}</div>
        </GuidedCard>
      ) : null}

      {flow.current === 3 && brief && decided ? (
        <GuidedCard index={3} total={total} eyebrow={name} title={`${humanize(decided.toState)}`} why={DECISION_TEXT[decided.toState]}>
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2">
              <CircleCheck size={17} className="text-[var(--badge-green-fg)]" aria-hidden />
              {humanize(decided.fromState)} → <strong>{humanize(decided.toState)}</strong> by {decided.actorName} · {formatDate(decided.createdAt)}
            </p>
            {decided.reasonDetail ? <p className="text-[var(--muted)]">Reason: {decided.reasonDetail}</p> : null}
            {decided.nextAction ? <p>Next action: {decided.nextAction}</p> : null}
            {brief.owner ? <p>Owner: {brief.owner.name}</p> : null}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={() => {
                setAccountId(null);
                flow.goTo(0);
              }}
            >
              Review the next brief{queue.length ? ` (${queue.length} waiting)` : ""}
            </Button>
            {decided.toState === "accepted" && can("manage_integrations") ? (
              <Link href="/accounts/crm">
                <Button>Send it to the CRM</Button>
              </Link>
            ) : null}
            <Link href={`/accounts/detail?id=${brief.account.id}`}>
              <Button variant="ghost">Open the account</Button>
            </Link>
          </div>
        </GuidedCard>
      ) : null}
    </div>
  );
}

export default function ReviewGuidePage() {
  return <RequireCap cap="accept">{(workspaceId) => <ReviewGuide workspaceId={workspaceId} />}</RequireCap>;
}
