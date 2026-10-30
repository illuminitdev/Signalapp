"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, ShieldAlert } from "lucide-react";
import { RequireCap } from "@/components/common/RequireCap";
import { OpportunityPanel } from "@/components/accounts/OpportunityPanel";
import { GuidedCard } from "@/components/guide/GuidedCard";
import { GuideHeader } from "@/components/guide/GuideHeader";
import { PickList } from "@/components/guide/PickList";
import { Stepper, type GuideStep } from "@/components/guide/Stepper";
import { TourHint } from "@/components/guide/TourHint";
import { FIELD_KEYS } from "@/components/qualification/FactEditor";
import { Button } from "@/components/ui/Button";
import { Field, FormError, humanize, inputClass } from "@/components/ui/Field";
import { useGuidedFlow } from "@/hooks/useGuidedFlow";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getBrief, listAccounts, type Brief } from "@/lib/api/accounts";
import { listAccountPeople, type Contact } from "@/lib/api/contacts";
import { listTasks, patchTask, TASK_TYPE_LABELS, type Task } from "@/lib/api/tasks";
import { formatDate } from "@/lib/utils/dates";

const STEPS: GuideStep[] = [
  { key: "pick", label: "Pick a task" },
  { key: "context", label: "Know the account" },
  { key: "outcome", label: "Record the outcome" },
  { key: "deal", label: "Deal (optional)" },
  { key: "done", label: "Done" },
];

const isOverdue = (t: Task) => Boolean(t.dueAt && new Date(t.dueAt).getTime() < Date.now());

function WorkGuide({ workspaceId }: { workspaceId: string }) {
  const { user, can } = useWorkspace();
  const [taskId, setTaskId] = usePersistentState<string | null>(`${workspaceId}:work:task`, null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [brief, setBrief] = useState<Brief | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [mode, setMode] = useState<"complete" | "cancel">("complete");
  const [outcome, setOutcome] = useState("");
  const [finished, setFinished] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!user) return;
    try {
      const [{ tasks: mine }, { accounts }] = await Promise.all([
        listTasks(workspaceId, { ownerUserId: user.id }),
        listAccounts(workspaceId),
      ]);
      setTasks(mine);
      setNames(new Map(accounts.map((a) => [a.id, a.name])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your tasks");
      setTasks([]);
    }
  }, [workspaceId, user]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const task = tasks?.find((t) => t.id === taskId) ?? null;

  useEffect(() => {
    if (!task) {
      setBrief(null);
      setContacts([]);
      return;
    }
    void getBrief(task.accountId, workspaceId).then(setBrief).catch(() => setBrief(null));
    void listAccountPeople(task.accountId, workspaceId)
      .then((r) => setContacts(r.contacts))
      .catch(() => setContacts([]));
  }, [task, workspaceId]);

  const open = (tasks ?? [])
    .filter((t) => t.status === "open" || t.status === "in_progress")
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"));
  const done = Boolean(finished) || (task ? task.status === "completed" || task.status === "cancelled" : false);
  const reachable = done ? 4 : task && brief ? 2 : 0;
  const flow = useGuidedFlow(`${workspaceId}:work`, STEPS.length, reachable);
  const total = STEPS.length;
  const accountName = task ? (names.get(task.accountId) ?? brief?.account.name ?? "this account") : "";
  const latestAccept = brief?.decisions.find((d) => d.toState === "accepted");
  const suppressedContacts = contacts.filter((c) => c.suppressed);

  async function record() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      const { task: updated } = await patchTask(task.id, {
        workspaceId,
        status: mode === "complete" ? "completed" : "cancelled",
        ...(mode === "complete" ? { outcome: outcome.trim() } : { cancelReason: outcome.trim() }),
      });
      setFinished(updated);
      await loadTasks();
      flow.goTo(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the outcome");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <GuideHeader
        eyebrow="Guided · Work my tasks"
        title="Pick a task, get the context, do it, and record what happened."
        fullPage={{ href: "/outreach/tasks", label: "Open the full task list" }}
      />
      <Stepper steps={STEPS} current={flow.current} reachable={reachable} onSelect={flow.goTo} />

      {flow.current === 0 ? (
        <GuidedCard
          index={0}
          total={total}
          eyebrow="Pick a task"
          title="What are you working on now?"
          why="Your open tasks, overdue first. SignalApp never calls or emails anyone; you do the contacting, then record the outcome here."
          onNext={() => {
            setFinished(null);
            setOutcome("");
            setMode("complete");
            flow.next();
          }}
          nextDisabledReason={task && brief ? null : "Pick a task"}
        >
          <TourHint id="work.pick">Red “Overdue” tasks first. Each task tells you what to do and by when.</TourHint>
          {tasks === null ? (
            <p className="text-sm text-[var(--muted)]">Loading your tasks…</p>
          ) : (
            <PickList
              label="tasks"
              items={open.map((t) => ({
                id: t.id,
                title: names.get(t.accountId) ?? "Account",
                badge: (
                  <>
                    <span className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[11px] font-semibold">{TASK_TYPE_LABELS[t.type]}</span>
                    {isOverdue(t) ? (
                      <span className="rounded bg-[var(--red-tint)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--red-active)]">Overdue</span>
                    ) : null}
                  </>
                ),
                subtitle: t.instruction ?? undefined,
                meta: t.dueAt ? `Due ${formatDate(t.dueAt)}` : "No due date",
              }))}
              selectedId={taskId}
              onSelect={(id) => {
                setTaskId(id);
                setFinished(null);
              }}
              empty="No open tasks. Nice work. New tasks assigned to you will appear here."
            />
          )}
        </GuidedCard>
      ) : null}

      {flow.current === 1 && task && brief ? (
        <GuidedCard
          index={1}
          total={total}
          eyebrow={accountName}
          title={`Know ${accountName} before you start`}
          why="The reviewed brief, why it was accepted, and who to talk to. Check suppression warnings before contacting anyone."
          onBack={flow.back}
          onNext={flow.next}
        >
          <TourHint id="work.context">Read the rationale and next action first; they say why this account matters right now.</TourHint>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[10px] bg-[var(--chip-bg)] px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Your task</p>
              <p className="mt-1 font-semibold">{TASK_TYPE_LABELS[task.type]}</p>
              <p className="mt-1">{task.instruction ?? "No instruction"}</p>
              {task.dueAt ? <p className="mt-1 text-[var(--muted)]">Due {formatDate(task.dueAt)}</p> : null}
            </div>
            <div className="rounded-[10px] bg-[var(--chip-bg)] px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Why it matters</p>
              <p className="mt-1 whitespace-pre-wrap">{brief.qualification?.rationale || "No rationale recorded."}</p>
              {latestAccept?.nextAction ? <p className="mt-2">Next action: {latestAccept.nextAction}</p> : null}
            </div>
          </div>
          <h3 className="mb-2 mt-6 text-[15px]">Key facts</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELD_KEYS.slice(0, 7).map((k) => {
              const f = brief.facts.find((x) => x.fieldKey === k);
              const isKnown = Boolean(f && f.basis !== "unknown");
              return (
                <div key={k} className="flex justify-between gap-2 rounded-[8px] border border-[var(--line)] px-3 py-2 text-sm">
                  <span className="font-medium">{humanize(k)}</span>
                  <span className={isKnown ? "truncate" : "text-[var(--muted)]"}>{isKnown ? f!.value : "Unknown"}</span>
                </div>
              );
            })}
          </div>
          <h3 className="mb-2 mt-6 text-[15px]">People</h3>
          {suppressedContacts.length ? (
            <p className="mb-2 flex items-center gap-2 rounded-[8px] bg-[var(--red-tint)] px-3 py-2 text-sm font-medium text-[var(--red-active)]">
              <ShieldAlert size={16} aria-hidden /> Do not contact: {suppressedContacts.map((c) => c.name).join(", ")}
            </p>
          ) : null}
          {contacts.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {contacts.map((c) => (
                <li key={c.id} className="py-2">
                  <span className="font-medium">{c.name}</span>
                  {c.title ? <span className="text-[var(--muted)]"> · {c.title}</span> : null}
                  {c.email || c.phone ? <span className="block text-xs">{[c.email, c.phone].filter(Boolean).join(" · ")}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">No sourced contacts yet.</p>
          )}
        </GuidedCard>
      ) : null}

      {flow.current === 2 && task ? (
        <GuidedCard
          index={2}
          total={total}
          eyebrow={accountName}
          title="What happened?"
          why="Recording an outcome only logs your work: it never sends a message, books a meeting, or moves the deal."
          onBack={flow.back}
          onNext={() => void record()}
          nextLabel={mode === "complete" ? "Complete the task" : "Cancel the task"}
          nextDisabledReason={outcome.trim() ? null : mode === "complete" ? "Write the outcome" : "Write why you're cancelling"}
          busy={busy}
        >
          <TourHint id="work.outcome">Be specific: who you spoke to, what they said, what happens next.</TourHint>
          <div className="mb-4 flex gap-2" role="radiogroup" aria-label="Result">
            {(["complete", "cancel"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                  mode === m ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--line)] bg-white hover:bg-[var(--chip-bg)]"
                }`}
              >
                {m === "complete" ? "I did it" : "Cancel this task"}
              </button>
            ))}
          </div>
          <Field label={mode === "complete" ? "Outcome" : "Reason for cancelling"} required>
            <textarea
              className={inputClass}
              rows={4}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder={
                mode === "complete"
                  ? "e.g. Spoke to the IT director; refresh budget approved for Q2; asked for a proposal by 15 Nov"
                  : "e.g. Account was merged into another record"
              }
            />
          </Field>
          <div className="mt-3">
            <FormError message={error} />
          </div>
        </GuidedCard>
      ) : null}

      {flow.current === 3 && task ? (
        <GuidedCard
          index={3}
          total={total}
          eyebrow={accountName}
          title="Did a real sales conversation start?"
          why="If yes, record the deal: stage, value and currency. This is separate from the task, and is what shows in the pipeline and reports."
          onBack={undefined}
          onNext={flow.next}
          nextLabel="Next"
        >
          <TourHint id="work.deal">Skip this if nothing changed. You can always record the deal later from the account page.</TourHint>
          {can("manage_pipeline") ? (
            <OpportunityPanel accountId={task.accountId} workspaceId={workspaceId} />
          ) : (
            <p className="text-sm text-[var(--muted)]">Your role can&apos;t record deals. Ask a sales reviewer.</p>
          )}
        </GuidedCard>
      ) : null}

      {flow.current === 4 && task ? (
        <GuidedCard
          index={4}
          total={total}
          eyebrow={accountName}
          title={task.status === "cancelled" ? "Task cancelled" : "Task completed"}
          why="It's recorded on the account and counts in Reports as your activity."
        >
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck size={17} className="text-[var(--badge-green-fg)]" aria-hidden />
            {TASK_TYPE_LABELS[task.type]} on {accountName}: {task.outcome ?? task.cancelReason ?? "recorded"}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={() => {
                setTaskId(null);
                setFinished(null);
                setOutcome("");
                flow.goTo(0);
              }}
            >
              Next task{open.length ? ` (${open.length} open)` : ""}
            </Button>
            <Link href={`/accounts/detail?id=${task.accountId}`}>
              <Button>Open the account</Button>
            </Link>
          </div>
        </GuidedCard>
      ) : null}
    </div>
  );
}

export default function WorkGuidePage() {
  return <RequireCap cap="tasks">{(workspaceId) => <WorkGuide workspaceId={workspaceId} />}</RequireCap>;
}
