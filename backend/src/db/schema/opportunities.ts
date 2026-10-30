import { pgTable, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, workspaces } from "./identity.js";
import { accounts } from "./accounts.js";

/**
 * Deal progress, kept separate from sales acceptance (R5: acceptance is independent of
 * pipeline stage). One opportunity per account in Phase 1.
 */
export const opportunityStages = ["qualified", "meeting", "proposal", "negotiation", "won", "lost"] as const;
export type OpportunityStage = (typeof opportunityStages)[number];

/** Where the values came from (R9: opportunity values include source and sync timestamp). */
export const opportunitySources = ["user_entered", "crm"] as const;
export type OpportunitySource = (typeof opportunitySources)[number];

/** CRM sync states shown separately (R8: Recorded, Queued, Synced, Failed). */
export const opportunitySyncStatuses = ["recorded", "queued", "synced", "failed"] as const;
export type OpportunitySyncStatus = (typeof opportunitySyncStatuses)[number];

export const opportunities = pgTable(
  "opportunities",
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
    stage: text("stage").notNull().$type<OpportunityStage>().default("qualified"),
    /** Whole units of `currency`; null means unknown, never zero by default */
    valueAmount: integer("value_amount"),
    currency: text("currency").notNull().default("GBP"),
    lostReason: text("lost_reason"),
    note: text("note"),
    source: text("source").notNull().$type<OpportunitySource>().default("user_entered"),
    externalId: text("external_id"),
    syncStatus: text("sync_status").notNull().$type<OpportunitySyncStatus>().default("recorded"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("opportunities_account_uidx").on(t.accountId),
    index("opportunities_workspace_idx").on(t.workspaceId),
  ],
);
