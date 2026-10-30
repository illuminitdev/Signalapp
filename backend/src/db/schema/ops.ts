import { boolean, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants, workspaces } from "./identity.js";

/** Per-workspace research entitlement and provider kill switch (spec §9). */
export const entitlements = pgTable(
  "entitlements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    researchEnabled: boolean("research_enabled").notNull().default(true),
    researchKillSwitch: boolean("research_kill_switch").notNull().default(false),
    // Phase 2: CRM sync can be switched off per workspace without removing the connection
    crmEnabled: boolean("crm_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("entitlements_workspace_idx").on(t.workspaceId)],
);
