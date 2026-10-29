ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "active_playbook_template_key" text DEFAULT 'infrastructure' NOT NULL;

