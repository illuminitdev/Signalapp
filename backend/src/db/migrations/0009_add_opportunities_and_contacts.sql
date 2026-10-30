CREATE TABLE IF NOT EXISTS "opportunities" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id"),
  "account_id" text NOT NULL REFERENCES "accounts"("id"),
  "stage" text DEFAULT 'qualified' NOT NULL,
  "value_amount" integer,
  "currency" text DEFAULT 'GBP' NOT NULL,
  "lost_reason" text,
  "note" text,
  "source" text DEFAULT 'user_entered' NOT NULL,
  "external_id" text,
  "sync_status" text DEFAULT 'recorded' NOT NULL,
  "synced_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_account_uidx" ON "opportunities" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_workspace_idx" ON "opportunities" ("workspace_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id"),
  "account_id" text NOT NULL REFERENCES "accounts"("id"),
  "name" text NOT NULL,
  "title" text,
  "buying_role" text DEFAULT 'unknown' NOT NULL,
  "email" text,
  "phone" text,
  "source_type" text NOT NULL,
  "evidence_id" text REFERENCES "evidence"("id") ON DELETE SET NULL,
  "source_note" text,
  "verification_status" text DEFAULT 'unverified' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_account_idx" ON "contacts" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_workspace_idx" ON "contacts" ("workspace_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_hypotheses" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id"),
  "account_id" text NOT NULL REFERENCES "accounts"("id"),
  "role_title" text NOT NULL,
  "buying_role" text DEFAULT 'unknown' NOT NULL,
  "rationale" text NOT NULL,
  "evidence_ids_json" text DEFAULT '[]' NOT NULL,
  "contact_id" text REFERENCES "contacts"("id") ON DELETE SET NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_hypotheses_account_idx" ON "role_hypotheses" ("account_id");
