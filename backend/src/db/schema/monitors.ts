import { boolean, integer, pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, workspaces, users } from "./identity.js";
import { accounts } from "./accounts.js";

export const monitors = pgTable(
  "monitors",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    playbookTemplateKey: text("playbook_template_key").notNull().default("infrastructure"),
    recipeJson: text("recipe_json").notNull().default("{}"),
    cadenceHours: integer("cadence_hours").notNull().default(168),
    status: text("status").notNull().default("active"),
    isSimulation: boolean("is_simulation").notNull().default(true),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastRunStatus: text("last_run_status"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("monitors_workspace_idx").on(t.workspaceId)],
);

export const monitorRuns = pgTable(
  "monitor_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    resultSummary: text("result_summary"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("monitor_runs_monitor_idx").on(t.monitorId)],
);

export const changeEvents = pgTable(
  "change_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    material: boolean("material").notNull().default(true),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("change_events_workspace_idx").on(t.workspaceId),
    index("change_events_monitor_idx").on(t.monitorId),
    uniqueIndex("change_events_workspace_dedupe_idx").on(t.workspaceId, t.dedupeKey),
  ],
);

