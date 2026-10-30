import { api } from "./client";

export type NotificationItem = {
  key: string;
  kind: "tasks" | "review" | "returned" | "decided" | "shared" | "handoff_reply" | "changes" | "accepted";
  label: string;
  detail: string | null;
  /** Page path inside the member's own portal */
  href: string;
  count: number;
  /** When each underlying thing happened, newest first (ISO) */
  times: string[];
};

/** The signed-in member's in-app notifications for this workspace (no email is sent). */
export function listNotifications(workspaceId: string) {
  return api<{ items: NotificationItem[] }>(`/v1/workspaces/${workspaceId}/notifications`);
}
