import { api } from "./client";

export type Task = {
  id: string;
  accountId: string;
  type: "research" | "review" | "call" | "email" | "follow_up";
  status: "open" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  instruction: string | null;
  outcome: string | null;
  cancelReason: string | null;
  ownerUserId: string;
  dueAt: string | null;
  timezone: string;
  createdBy: string;
  createdAt: string;
  /** Last change; for a completed task, when it was completed */
  updatedAt: string;
};

export const TASK_TYPE_LABELS: Record<Task["type"], string> = {
  research: "Research",
  review: "Sales review",
  call: "Call",
  email: "Email",
  follow_up: "Follow-up",
};

export type TaskFilters = {
  ownerUserId?: string;
  status?: string;
  priority?: string;
  accountId?: string;
  due?: "overdue" | "today" | "week";
};

export function listTasks(workspaceId: string, filters: TaskFilters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
  return api<{ tasks: Task[] }>(`/v1/workspaces/${workspaceId}/tasks${qs.size ? `?${qs}` : ""}`);
}

export function createTask(body: {
  workspaceId: string;
  accountId: string;
  type: Task["type"];
  ownerUserId: string;
  dueAt?: string;
  timezone?: string;
  instruction?: string;
  priority?: Task["priority"];
  idempotencyKey?: string;
  confirmFollowUp?: boolean;
}) {
  return api<{ task: Task }>("/v1/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Saves the note, submits the account for review, tasks the reviewer and completes this research task */
export function sendForReview(taskId: string, body: { workspaceId: string; note: string; reviewerUserId: string }) {
  return api<{ researchTask: Task; reviewTask: Task }>(`/v1/tasks/${taskId}/send-for-review`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchTask(taskId: string, body: Record<string, unknown>) {
  return api<{ task: Task }>(`/v1/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
