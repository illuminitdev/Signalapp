"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, FormNotice } from "@/components/ui/Field";
import { changePassword, me, type User } from "@/lib/auth/session";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function PlatformSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    me()
      .then((r) => setUser(r.user))
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform" title="Settings" description="Your platform admin account." />

      <Card>
        <h2 className="text-[15px]">Account</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">Name</dt>
            <dd className="mt-1">{user?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">Email</dt>
            <dd className="mt-1">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">Role</dt>
            <dd className="mt-1">Platform admin (all companies, counts only)</dd>
          </div>
        </dl>
      </Card>

      <Card accent>
        <form
          className="max-w-md space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            setNotice(null);
            try {
              await changePassword(current, next);
              setCurrent("");
              setNext("");
              setConfirm("");
              setNotice("Password changed. Other sessions were signed out.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not change the password");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="text-[15px]">Change password</h2>
          <Field label="Current password">
            <PasswordInput id="pw-current" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password">
            <PasswordInput id="pw-new" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput id="pw-confirm" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {confirm && next !== confirm ? <FormError message="The new passwords don't match." /> : null}
          <FormError message={error} />
          <FormNotice message={notice} />
          <Button type="submit" variant="primary" disabled={busy || next.length < 8 || next !== confirm || !current}>
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
