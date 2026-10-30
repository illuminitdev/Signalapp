CREATE TABLE IF NOT EXISTS "crm_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "provider" text NOT NULL,
  "encrypted_credential" text NOT NULL,
  "credential_hint" text NOT NULL,
  "external_account_id" text,
  "external_account_label" text,
  "status" text DEFAULT 'connected' NOT NULL,
  "last_checked_at" timestamp with time zone,
  "last_error" text,
  "connected_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_connections_tenant_uidx" ON "crm_connections" ("tenant_id");
