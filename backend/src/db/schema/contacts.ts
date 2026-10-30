import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants, workspaces } from "./identity.js";
import { accounts } from "./accounts.js";
import { evidence } from "./research.js";

/**
 * A real, sourced person at an account (spec §7 Contact). Identity needs an explicit
 * source record; research results never mark a contact as verified (spec §6).
 */
export const contactSourceTypes = ["evidence", "user_entered"] as const;
export type ContactSourceType = (typeof contactSourceTypes)[number];

/** Phase 1 has no verification adapter, so every contact stays unverified. */
export const contactVerificationStatuses = ["unverified"] as const;
export type ContactVerificationStatus = (typeof contactVerificationStatuses)[number];

export const buyingRoles = [
  "decision_maker",
  "budget_holder",
  "technical_evaluator",
  "influencer",
  "procurement",
  "user",
  "unknown",
] as const;
export type BuyingRole = (typeof buyingRoles)[number];

export const contacts = pgTable(
  "contacts",
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
    name: text("name").notNull(),
    title: text("title"),
    buyingRole: text("buying_role").notNull().$type<BuyingRole>().default("unknown"),
    email: text("email"),
    phone: text("phone"),
    sourceType: text("source_type").notNull().$type<ContactSourceType>(),
    evidenceId: text("evidence_id").references(() => evidence.id, { onDelete: "set null" }),
    /** Where this person's details came from, e.g. "Met at UCISA conference, 12 Oct" */
    sourceNote: text("source_note"),
    verificationStatus: text("verification_status")
      .notNull()
      .$type<ContactVerificationStatus>()
      .default("unverified"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contacts_account_idx").on(t.accountId), index("contacts_workspace_idx").on(t.workspaceId)],
);

/**
 * A guess about a buying role at the account, with no person attached (spec §7
 * RoleHypothesis). Kept apart from contacts so a hypothesis is never mistaken for a person.
 */
export const roleHypotheses = pgTable(
  "role_hypotheses",
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
    roleTitle: text("role_title").notNull(),
    buyingRole: text("buying_role").notNull().$type<BuyingRole>().default("unknown"),
    rationale: text("rationale").notNull(),
    evidenceIdsJson: text("evidence_ids_json").notNull().default("[]"),
    /** Set once a sourced contact is found who fills this role */
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("role_hypotheses_account_idx").on(t.accountId)],
);
