import { pgTable, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, workspaces } from "./identity.js";

/** What a SignalApp record becomes in the CRM. "account" also carries the account's last sync run. */
export const crmEntityTypes = ["account", "contact", "opportunity"] as const;
export type CrmEntityType = (typeof crmEntityTypes)[number];

/** Shown separately in the UI (R8: Recorded, Queued, Synced, Failed). */
export const crmSyncStatuses = ["recorded", "queued", "synced", "failed"] as const;
export type CrmSyncStatus = (typeof crmSyncStatuses)[number];

/**
 * Link between a SignalApp record and its CRM object (spec §7 CRMMapping). The external id makes
 * every sync an update after the first one, so retries never create duplicates.
 */
export const crmMappings = pgTable(
  "crm_mappings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    provider: text("provider").notNull(),
    entityType: text("entity_type").notNull().$type<CrmEntityType>(),
    entityId: text("entity_id").notNull(),
    externalId: text("external_id"),
    syncStatus: text("sync_status").notNull().$type<CrmSyncStatus>().default("recorded"),
    lastError: text("last_error"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    syncedBy: text("synced_by"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_mappings_entity_uidx").on(t.provider, t.entityType, t.entityId),
    index("crm_mappings_workspace_idx").on(t.workspaceId),
  ],
);
