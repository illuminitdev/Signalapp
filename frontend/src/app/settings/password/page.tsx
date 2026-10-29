"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { changePassword } from "@/lib/auth/session";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, FormNotice } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, refresh } = useWorkspace();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const forced = Boolean(user?.mustChangePassword);

  const mismatch = confirm.length > 0 && next !== confirm;

  return (
    <div className="max-w-md">
      <Card>
        <h1 className="text-[20px]">{forced ? "Set your own password" : "Change password"}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {forced
            ? "You signed in with a temporary password. Choose a new one to continue."
            : "Changing your password signs you out on all other devices."}
        </p>
        <form
          className="mt-4 space-y-3"
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
              if (forced) {
                await refresh();
                router.replace("/researcher");
              } else {
                setNotice("Password changed. Other devices have been signed out.");
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not change password");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={forced ? "Temporary password" : "Current password"}>
            <PasswordInput
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password">
            <PasswordInput
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
            />
          </Field>
          {mismatch ? <FormError message="The new passwords don't match." /> : null}
          <FormError message={error} />
          <FormNotice message={notice} />
          <Button type="submit" variant="primary" disabled={busy || next.length < 8 || next !== confirm || !current}>
            {forced ? "Set password and continue" : "Change password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
