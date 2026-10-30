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

/** CRMs a company can connect. Only HubSpot has an adapter today; the others are listed as coming soon. */
export const crmProviders = ["hubspot", "salesforce", "other"] as const;
export type CrmProviderKey = (typeof crmProviders)[number];

/**
 * A company's own CRM connection (one per tenant). The credential is encrypted at rest and never
 * returned to the browser; only its last four characters are kept for display.
 */
export const crmConnections = pgTable(
  "crm_connections",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: text("provider").notNull().$type<CrmProviderKey>(),
    encryptedCredential: text("encrypted_credential").notNull(),
    credentialHint: text("credential_hint").notNull(),
    /** The CRM account it reached, e.g. a HubSpot portal id, for "Connected to …" and "Open in CRM" links */
    externalAccountId: text("external_account_id"),
    externalAccountLabel: text("external_account_label"),
    /** connected | failed (last check could not reach the CRM with this credential) */
    status: text("status").notNull().default("connected"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    connectedBy: text("connected_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_connections_tenant_uidx").on(t.tenantId)],
);
