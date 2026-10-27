"use client";

import Link from "next/link";
import { usePagination } from "../ui/Pagination";
import { useEffect, useState } from "react";
import { sendForReview, TASK_TYPE_LABELS, type Task } from "../../lib/api/tasks";
import { listPeople, type Account } from "../../lib/api/accounts";
import { useWorkspace } from "../../hooks/useWorkspace";
import { ROLE_LABELS } from "../../lib/auth/capabilities";
import { formatDate } from "../../lib/utils/dates";
import { StatusBadge } from "../common/StatusBadge";
import { EmptyState } from "../common/EmptyState";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FormError, humanize, inputClass } from "../ui/Field";

type Pending = { taskId: string; kind: "complete" | "cancel" } | null;

/** What the owner does for each task type, in order */
const STEPS: Record<Task["type"], string[]> = {
  research: [
    "Click “Open account brief”, read the evidence and click “Mark as reviewed” on the items that support it.",
    "Come back here, write a short note for the reviewer, choose the reviewer and click “Send to sales reviewer”. Your task then completes by itself.",
  ],
  review: [
    "Open the account brief and read the reviewed evidence and qualification.",
    "Under Sales acceptance, Accept (choose an owner and next action), or Return / Reject with a reason.",
    "Come back here and click “Complete…” with your decision.",
  ],
  call: [
    "Open the account brief for context.",
    "Make the call outside SignalApp.",
    "Come back here and click “Complete…” with the outcome.",
  ],
  email: [
    "Open the account brief for context; approved drafts are under Outreach → Drafts.",
    "Send the email outside SignalApp.",
    "Come back here and click “Complete…” with the outcome.",
  ],
  follow_up: [
    "Open the account brief and check the previous outcome.",
    "Follow up outside SignalApp.",
    "Come back here and click “Complete…” with the outcome.",
  ],
};

/** The researcher's one-step hand-off: note + reviewer, and the server does the rest */
function SendForReviewForm({
  task,
  workspaceId,
  onSent,
}: {
  task: Task;
  workspaceId: string;
  onSent: (message: string) => void | Promise<void>;
}) {
  const [reviewers, setReviewers] = useState<Array<{ userId: string; name: string; role: string }>>([]);
  const [reviewerUserId, setReviewerUserId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listPeople(workspaceId)
      .then((r) => {
        const list = r.people.filter((p) => p.role === "sales_reviewer" || p.role === "tenant_admin");
        setReviewers(list);
        setReviewerUserId((id) => id || (list.find((p) => p.role === "sales_reviewer") ?? list[0])?.userId || "");
      })
      .catch(() => setReviewers([]));
  }, [workspaceId]);

  return (
    <form
      className="space-y-2 border-t border-[var(--line)] pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await sendForReview(task.id, { workspaceId, note, reviewerUserId });
          const name = reviewers.find((r) => r.userId === reviewerUserId)?.name ?? "the reviewer";
          await onSent(`Sent to ${name} for review. Your research task is completed.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not send for review");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Send to sales reviewer</p>
      <label className="block text-xs font-semibold text-[var(--muted)]">
        Note for the reviewer (required)
        <textarea
          className={inputClass}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Hiring cloud infrastructure engineers for a data centre migration — likely to need new servers soon."
        />
      </label>
      <label className="block text-xs font-semibold text-[var(--muted)]">
        Reviewer
        <select className={inputClass} value={reviewerUserId} onChange={(e) => setReviewerUserId(e.target.value)}>
          {reviewers.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.name} ({ROLE_LABELS[r.role] ?? r.role})
            </option>
          ))}
        </select>
      </label>
      <FormError message={error} />
      <Button type="submit" variant="primary" disabled={busy || !note.trim() || !reviewerUserId}>
        {busy ? "Sending…" : "Send to sales reviewer"}
      </Button>
    </form>
  );
}

export function TaskQueue({
  tasks,
  accountNames,
  accounts,
  peopleNames,
  canEdit,
  onUpdate,
  workspaceId,
  onAccountChanged,
  onSent,
}: {
  tasks: Task[];
  accountNames: Map<string, string>;
  /** Shown in the task details when available */
  accounts?: Map<string, Account>;
  peopleNames: Map<string, string>;
  canEdit: boolean;
  onUpdate: (taskId: string, body: Record<string, unknown>) => Promise<void>;
  /** Enables “Send to sales reviewer” on research tasks */
  workspaceId?: string;
  onAccountChanged?: () => void;
  /** Called after a research task is sent for review (it is then completed) */
  onSent?: (message: string) => void | Promise<void>;
}) {
  const { can } = useWorkspace();
  const [pending, setPending] = useState<Pending>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Tasks in progress show details by default; this holds the ones flipped from their default
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setToggled((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { pageItems, pager, topRef } = usePagination(tasks);

  if (!tasks.length) {
    return <EmptyState title="No tasks match" detail="Change the filters or create a task." />;
  }

  async function submit(taskId: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await onUpdate(taskId, body);
      setPending(null);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  const now = Date.now();
  return (
    <div>
      <ul ref={topRef} className="scroll-mt-24 space-y-3">
        {pageItems.map((t) => {
          const open = t.status === "open" || t.status === "in_progress";
          const overdue = open && t.dueAt && new Date(t.dueAt).getTime() < now;
          const showDetails = (t.status === "in_progress") !== toggled.has(t.id);
          const account = accounts?.get(t.accountId);
          return (
            <li key={t.id}>
              <Card className="!p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">
                      {TASK_TYPE_LABELS[t.type] ?? humanize(t.type)} ·{" "}
                      <Link href={`/accounts/${t.accountId}`} className="hover:text-[var(--red-active)]">
                        {accountNames.get(t.accountId) ?? "Account"}
                      </Link>
                    </p>
                    <p className="text-sm text-[var(--muted)]">{t.instruction ?? "No instruction"}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Owner {peopleNames.get(t.ownerUserId) ?? "—"} · Due {t.dueAt ? formatDate(t.dueAt) : "—"} ({t.timezone})
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Assigned by {peopleNames.get(t.createdBy) ?? "—"} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {overdue ? <Badge tone="red">Overdue</Badge> : null}
                    {t.priority !== "normal" ? <Badge tone={t.priority === "urgent" || t.priority === "high" ? "amber" : "default"}>{humanize(t.priority)}</Badge> : null}
                    <StatusBadge status={t.status} />
                  </div>
                </div>
                {showDetails ? (
                  <div className="mt-3 space-y-3 rounded-[7px] border border-[var(--line)] bg-[var(--chip-bg)] p-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Account</p>
                      <p className="font-medium text-[var(--foreground)]">{accountNames.get(t.accountId) ?? "Account"}</p>
                      {account ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                          <span>{[account.domain, account.country].filter(Boolean).join(" · ") || "Website unknown"}</span>
                          <StatusBadge status={account.researchState} />
                          <StatusBadge status={account.acceptanceState} />
                          <span>Priority {account.fitScore ?? "—"} / 100</span>
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Instruction</p>
                      <p>{t.instruction ?? "No instruction — follow the steps below."}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">What to do</p>
                      <ol className="mt-1 list-decimal space-y-1 pl-5">
                        {(STEPS[t.type] ?? []).map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/accounts/${t.accountId}`}>
                        <Button>Open account brief</Button>
                      </Link>
                    </div>
                    {t.type === "research" && open && workspaceId && can("submit_review") ? (
                      <SendForReviewForm
                        task={t}
                        workspaceId={workspaceId}
                        onSent={async (message) => {
                          await onSent?.(message);
                          onAccountChanged?.();
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
                {open && canEdit ? (
                  pending?.taskId === t.id ? (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submit(
                          t.id,
                          pending.kind === "complete"
                            ? { status: "completed", outcome: text }
                            : { status: "cancelled", cancelReason: text },
                        );
                      }}
                    >
                      <label className="block text-xs font-semibold text-[var(--muted)]">
                        {pending.kind === "complete" ? "Outcome (required)" : "Cancellation reason (required)"}
                        <input
                          autoFocus
                          className={inputClass}
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          placeholder={pending.kind === "complete" ? "e.g. Spoke to IT lead, meeting being arranged" : "e.g. Duplicate of another task"}
                        />
                      </label>
                      <FormError message={error} />
                      <div className="flex gap-2">
                        <Button type="submit" variant="primary" disabled={!text.trim()}>
                          {pending.kind === "complete" ? "Complete task" : "Cancel task"}
                        </Button>
                        <Button variant="ghost" onClick={() => setPending(null)}>
                          Back
                        </Button>
                      </div>
                      {pending.kind === "complete" ? (
                        <p className="text-xs text-[var(--muted)]">
                          Completing records activity only. It does not change pipeline stage or log a meeting.
                        </p>
                      ) : null}
                    </form>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {t.status === "open" ? (
                        <Button onClick={() => void submit(t.id, { status: "in_progress" })}>Start</Button>
                      ) : null}
                      <Button variant="primary" onClick={() => setPending({ taskId: t.id, kind: "complete" })}>
                        Complete…
                      </Button>
                      <Button variant="ghost" onClick={() => setPending({ taskId: t.id, kind: "cancel" })}>
                        Cancel…
                      </Button>
                      <Button variant="ghost" onClick={() => toggle(t.id)}>
                        {showDetails ? "Hide details" : "Details"}
                      </Button>
                    </div>
                  )
                ) : !open ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {t.status === "completed" ? `Outcome: ${t.outcome}` : `Cancelled: ${t.cancelReason}`}
                  </p>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
      {pager}
    </div>
  );
}
