import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, workspaces, users } from "./identity.js";
import { accounts } from "./accounts.js";

export const acceptanceStates = [
  "draft",
  "ready_for_review",
  "accepted",
  "needs_research",
  "rejected",
] as const;
export type AcceptanceState = (typeof acceptanceStates)[number];

export const acceptanceDecisions = pgTable(
  "acceptance_decisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull().$type<AcceptanceState>(),
    reasonCategory: text("reason_category"),
    reasonDetail: text("reason_detail"),
    briefVersion: text("brief_version"),
    nextAction: text("next_action"),
    ownerUserId: text("owner_user_id"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("acceptance_decisions_account_idx").on(t.accountId)],
);

export const taskTypes = ["research", "review", "call", "email", "follow_up"] as const;
export type TaskType = (typeof taskTypes)[number];
export const taskStatuses = ["open", "in_progress", "completed", "cancelled"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    type: text("type").notNull().$type<TaskType>(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    timezone: text("timezone").notNull().default("UTC"),
    instruction: text("instruction"),
    status: text("status").notNull().$type<TaskStatus>().default("open"),
    outcome: text("outcome"),
    cancelReason: text("cancel_reason"),
    priority: text("priority").notNull().default("normal"),
    idempotencyKey: text("idempotency_key"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_workspace_idx").on(t.workspaceId),
    uniqueIndex("tasks_idempotency_uidx").on(t.workspaceId, t.idempotencyKey),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    accountId: text("account_id").references(() => accounts.id),
    taskId: text("task_id").references(() => tasks.id),
    kind: text("kind").notNull(),
    note: text("note"),
    actorUserId: text("actor_user_id").notNull(),
    externalEventId: text("external_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_workspace_idx").on(t.workspaceId)],
);

export const handoffStates = [
  "prepared",
  "shared",
  "acknowledged",
  "returned",
  "closed",
] as const;
export type HandoffState = (typeof handoffStates)[number];

export const handoffs = pgTable(
  "handoffs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    receivingOrg: text("receiving_org").notNull(),
    receivingUser: text("receiving_user"),
    internalOwnerUserId: text("internal_owner_user_id").notNull(),
    permittedFieldsJson: text("permitted_fields_json").notNull().default("[]"),
    reason: text("reason").notNull(),
    nextAction: text("next_action"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    state: text("state").notNull().$type<HandoffState>().default("prepared"),
    returnReason: text("return_reason"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
  },
  (t) => [index("handoffs_account_idx").on(t.accountId)],
);

export const handoffAccess = pgTable(
  "handoff_access",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    handoffId: text("handoff_id")
      .notNull()
      .references(() => handoffs.id),
    granteeEmail: text("grantee_email").notNull(),
    fieldsJson: text("fields_json").notNull().default("[]"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("handoff_access_handoff_idx").on(t.handoffId)],
);
