CREATE TABLE IF NOT EXISTS "crm_mappings" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id"),
  "provider" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "external_id" text,
  "sync_status" text DEFAULT 'recorded' NOT NULL,
  "last_error" text,
  "last_attempt_at" timestamp with time zone,
  "synced_at" timestamp with time zone,
  "synced_by" text,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_mappings_entity_uidx" ON "crm_mappings" ("provider", "entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_mappings_workspace_idx" ON "crm_mappings" ("workspace_id");
--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "crm_enabled" boolean DEFAULT true NOT NULL;
