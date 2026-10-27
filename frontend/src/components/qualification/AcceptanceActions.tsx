"use client";

import { useEffect, useState } from "react";
import { listPeople, transitionAcceptance, type Decision } from "../../lib/api/accounts";
import { useWorkspace } from "../../hooks/useWorkspace";
import { ROLE_LABELS } from "../../lib/auth/capabilities";
import { formatDate } from "../../lib/utils/dates";
import { StatusBadge } from "../common/StatusBadge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field, FormError, FormNotice, humanize, inputClass } from "../ui/Field";

const REASONS = [
  "incomplete_evidence",
  "stale_evidence",
  "not_a_fit",
  "wrong_territory",
  "duplicate",
  "timing",
  "existing_relationship",
  "other",
];

const SUCCESS: Record<string, string> = {
  ready_for_review: "Submitted for review. A tenant admin or sales reviewer will see it under Accounts → Sales acceptance.",
  accepted: "Accepted and assigned to the owner.",
  needs_research: "Returned to research.",
  rejected: "Rejected.",
};

export function AcceptanceActions({
  accountId,
  workspaceId,
  state,
  version,
  currentOwnerId,
  reviewedEvidenceCount,
  decisions,
  onDone,
}: {
  accountId: string;
  workspaceId: string;
  state: string;
  version: number;
  currentOwnerId: string | null;
  reviewedEvidenceCount: number;
  decisions: Decision[];
  onDone: () => void;
}) {
  const { can, role, user } = useWorkspace();
  const [people, setPeople] = useState<Array<{ userId: string; name: string; role: string }>>([]);
  const [ownerUserId, setOwnerUserId] = useState(currentOwnerId ?? "");
  const [nextAction, setNextAction] = useState("");
  const [reasonCategory, setReasonCategory] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Don't carry one user's confirmation over to whoever signs in next in the same tab
  useEffect(() => {
    setNotice(null);
    setError(null);
  }, [user?.id, accountId]);

  const isReviewer = can("accept");
  useEffect(() => {
    if (!isReviewer) return;
    void listPeople(workspaceId)
      .then((r) => setPeople(r.people))
      .catch(() => setPeople([]));
  }, [workspaceId, isReviewer]);

  async function transition(toState: string, extra: Record<string, string | undefined> = {}) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await transitionAcceptance(accountId, workspaceId, { toState, expectedVersion: version, ...extra });
      setReasonCategory("");
      setReasonDetail("");
      setNotice(SUCCESS[toState] ?? "Saved.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  const awaitingSubmit = state === "draft" || state === "needs_research";
  // Admins hand qualification to researchers; submitting stays the researcher's step
  const canSubmit = can("submit_review") && role !== "tenant_admin" && awaitingSubmit;
  const canDecide = isReviewer && state === "ready_for_review";
  const canReopen = isReviewer && (state === "accepted" || state === "rejected");

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px]">Sales acceptance</h2>
        <StatusBadge status={state} />
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Acceptance is separate from pipeline stage and tasks. It needs reviewed evidence ({reviewedEvidenceCount}{" "}
        reviewed), an accountable owner and a next action, and the account can&apos;t be suppressed.
      </p>

      {canSubmit ? (
        <div className="mt-4">
          <Button variant="primary" disabled={busy} onClick={() => transition("ready_for_review")}>
            Submit for review
          </Button>
          <p className="mt-1 text-xs text-[var(--muted)]">Needs a saved rationale (a short note for the reviewer). Easiest: use “Send to sales reviewer” on your task under Outreach → Tasks.</p>
        </div>
      ) : null}

      {canDecide ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Accountable owner">
              <select className={inputClass} value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
                <option value="">Choose a person…</option>
                {people.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name} ({ROLE_LABELS[p.role] ?? p.role})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Next action">
              <input
                className={inputClass}
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="e.g. Call the infrastructure lead"
              />
            </Field>
          </div>
          <Button
            variant="primary"
            disabled={busy || !ownerUserId || !nextAction.trim()}
            onClick={() => transition("accepted", { ownerUserId, nextAction })}
          >
            Accept
          </Button>

          <div className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
            <Field label="Reason (required to return or reject)">
              <select className={inputClass} value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)}>
                <option value="">Choose a reason…</option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {humanize(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Detail (optional)">
              <input className={inputClass} value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} placeholder="e.g. No evidence newer than 6 months" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !reasonCategory}
              onClick={() => transition("needs_research", { reasonCategory, reasonDetail: reasonDetail || undefined })}
            >
              Return for more research
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !reasonCategory}
              onClick={() => transition("rejected", { reasonCategory, reasonDetail: reasonDetail || undefined })}
            >
              Reject
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Rejecting a brief is not the same as suppressing contact. Use Settings → Suppressions for do-not-contact.
          </p>
        </div>
      ) : null}

      {canReopen ? (
        <div className="mt-4 space-y-3">
          <Field label="Reason for reopening">
            <input className={inputClass} value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} placeholder="e.g. New evidence of a refresh project" />
          </Field>
          <Button disabled={busy || !reasonDetail.trim()} onClick={() => transition("ready_for_review", { reasonDetail })}>
            Reopen for review
          </Button>
        </div>
      ) : null}

      {!canSubmit && !canDecide && !canReopen ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          {state === "ready_for_review"
            ? "Waiting for a sales reviewer."
            : awaitingSubmit && role === "tenant_admin"
              ? "Waiting for a researcher to qualify and submit this account. Assign them a research task below."
              : "No acceptance actions are available for your role at this stage."}
        </p>
      ) : null}

      <FormError message={error} />
      <FormNotice message={notice} />

      {decisions.length ? (
        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <h3 className="text-[13px] font-semibold">Decision history</h3>
          <ol className="mt-2 space-y-2 text-xs text-[var(--muted)]">
            {decisions.map((d) => (
              <li key={d.id}>
                <span className="font-semibold text-[var(--foreground)]">
                  {humanize(d.fromState)} → {humanize(d.toState)}
                </span>{" "}
                by {d.actorName === user?.name ? "you" : d.actorName} · {formatDate(d.createdAt)}
                {d.briefVersion ? ` · brief v${d.briefVersion}` : ""}
                {d.reasonCategory ? ` · ${humanize(d.reasonCategory)}` : ""}
                {d.reasonDetail ? ` — ${d.reasonDetail}` : ""}
                {d.nextAction ? ` · next: ${d.nextAction}` : ""}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Card>
  );
}
