CREATE TABLE IF NOT EXISTS "monitors" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id"),
  "name" text NOT NULL,
  "playbook_template_key" text DEFAULT 'infrastructure' NOT NULL,
  "recipe_json" text DEFAULT '{}' NOT NULL,
  "cadence_hours" integer DEFAULT 168 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "is_simulation" boolean DEFAULT true NOT NULL,
  "last_success_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone,
  "last_run_status" text,
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitors_workspace_idx" ON "monitors" ("workspace_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id"),
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "result_summary" text,
  "error" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_runs_monitor_idx" ON "monitor_runs" ("monitor_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "change_events" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id"),
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE CASCADE,
  "account_id" text REFERENCES "accounts"("id") ON DELETE SET NULL,
  "dedupe_key" text NOT NULL,
  "title" text NOT NULL,
  "detail" text,
  "material" boolean DEFAULT true NOT NULL,
  "discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_events_workspace_idx" ON "change_events" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_events_monitor_idx" ON "change_events" ("monitor_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "change_events_workspace_dedupe_idx" ON "change_events" ("workspace_id", "dedupe_key");

