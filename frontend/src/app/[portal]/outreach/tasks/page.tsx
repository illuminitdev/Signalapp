"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { TaskQueue } from "@/components/tasks/TaskQueue";
import { TaskForm } from "@/components/tasks/TaskForm";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePersistentState } from "@/hooks/usePersistentState";
import { listTasks, patchTask, type Task, type TaskFilters } from "@/lib/api/tasks";
import { listAccounts, listPeople, type Account } from "@/lib/api/accounts";
import { Button } from "@/components/ui/Button";
import { Field, FormNotice, inputClass } from "@/components/ui/Field";

const QUEUE_INTRO: Record<string, string> = {
  researcher: "Research tasks assigned to you: review the evidence, qualify and submit each account for review.",
  sales_reviewer: "Sales review tasks assigned to you: accept, return or reject submitted accounts.",
  sdr: "Call, email and follow-up tasks on your accounts.",
};

function SdrQueue({ workspaceId }: { workspaceId: string }) {
  const { can, role, user } = useWorkspace();
  // The server returns only the member's own tasks unless they are the tenant admin
  const isAdmin = role === "tenant_admin";
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Array<{ userId: string; name: string }>>([]);
  // v2: the default moved from "open" to "active", so saved filters don't hide started tasks
  const [filters, setFilters] = usePersistentState<TaskFilters>(`${workspaceId}:tasks:filters:v2`, { status: "active" });
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([listTasks(workspaceId, filters), listAccounts(workspaceId)]);
      setTasks(t.tasks);
      setAccounts(a.accounts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tasks");
    }
  }, [workspaceId, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    void listPeople(workspaceId)
      .then((r) => setPeople(r.people))
      .catch(() => setPeople(user ? [{ userId: user.id, name: user.name }] : []));
  }, [workspaceId, user]);

  const accountNames = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const peopleNames = useMemo(() => new Map(people.map((p) => [p.userId, p.name])), [people]);
  const set = (k: keyof TaskFilters, v: string) => setFilters((f) => ({ ...f, [k]: v || undefined }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? "Team overview" : "Your work"}
        title={isAdmin ? "All tasks" : "My tasks"}
        description={
          isAdmin
            ? "Every task in the workspace — who it is assigned to, who assigned it and where it stands. Filter by owner to see one person's queue."
            : (QUEUE_INTRO[role ?? ""] ?? "Tasks assigned to you.") + " Nothing here sends messages — record what you did and the outcome."
        }
        actions={
          can("tasks") ? (
            <Button
              variant="primary"
              onClick={() => {
                setNotice(null);
                setShowForm((s) => !s);
              }}
            >
              {showForm ? "Close" : "New task"}
            </Button>
          ) : null
        }
      />
      {showForm ? (
        <TaskForm
          workspaceId={workspaceId}
          accounts={accounts}
          onCreated={(message) => {
            setShowForm(false);
            setNotice(message);
            void refresh();
          }}
        />
      ) : null}
      <FormNotice message={notice} />

      <div className="grid gap-3 sm:grid-cols-4" role="group" aria-label="Task filters">
        {isAdmin ? (
          <Field label="Owner">
            <select className={inputClass} value={filters.ownerUserId ?? ""} onChange={(e) => set("ownerUserId", e.target.value)}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Status">
          <select className={inputClass} value={filters.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            <option value="">Any</option>
            <option value="active">Open or in progress</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Due">
          <select className={inputClass} value={filters.due ?? ""} onChange={(e) => set("due", e.target.value)}>
            <option value="">Any time</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due within 24 hours</option>
            <option value="week">Due within 7 days</option>
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={filters.priority ?? ""} onChange={(e) => set("priority", e.target.value)}>
            <option value="">Any</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </Field>
      </div>

      {error ? <ErrorState message={error} /> : null}
      {tasks === null ? (
        <LoadingState label="Loading tasks…" />
      ) : (
        <TaskQueue
          tasks={tasks}
          accountNames={accountNames}
          accounts={accountsById}
          peopleNames={peopleNames}
          canEdit={can("tasks")}
          onUpdate={async (taskId, body) => {
            await patchTask(taskId, { workspaceId, ...body });
            // A finished task leaves the active list, so follow it to where it now lives
            if (body.status === "completed" || body.status === "cancelled") {
              setNotice(
                body.status === "completed"
                  ? "Task completed. Showing your completed tasks — set Status back to “Open or in progress” for the rest."
                  : "Task cancelled. Showing your cancelled tasks — set Status back to “Open or in progress” for the rest.",
              );
              setFilters((f) => ({ ...f, status: body.status as string }));
            } else {
              setNotice(null);
              await refresh();
            }
          }}
          workspaceId={workspaceId}
          onAccountChanged={() => void refresh()}
          onSent={(message) => {
            setNotice(`${message} Showing your completed tasks.`);
            setFilters((f) => ({ ...f, status: "completed" }));
          }}
        />
      )}
    </div>
  );
}

export default function TasksPage() {
  return <RequireCap cap="view_tasks">{(workspaceId) => <SdrQueue workspaceId={workspaceId} />}</RequireCap>;
}

