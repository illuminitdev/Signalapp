"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  grantMembership,
  listMemberships,
  resetMemberPassword,
  revokeMembership,
  type MembershipRow,
} from "@/lib/api/memberships";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/capabilities";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, inputClass } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { usePagination } from "@/components/ui/Pagination";

const ROLES = ["tenant_admin", "researcher", "sdr", "sales_reviewer", "partner", "analyst"] as const;

function Members({ workspaceId }: { workspaceId: string }) {
  const { user } = useWorkspace();
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("researcher");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const { pageItems, pager } = usePagination(rows);

  const refresh = useCallback(async () => {
    try {
      setRows((await listMemberships(workspaceId)).memberships);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access"
        title="Workspace members"
        description="Access comes only from an explicit membership — belonging to an organization never grants it. Agency users get delegated membership here too. Revoking takes effect on their next request."
      />
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            setNotice(null);
            try {
              const res = await grantMembership(workspaceId, { email, name: name || undefined, role, password: password || undefined });
              setNotice(
                res.existingAccount
                  ? `${email} already had a SignalApp account, so they keep their own password and can sign in now.`
                  : `${email} can sign in now with the password you set. They can change it under Settings → Password.`,
              );
              setEmail("");
              setName("");
              setPassword("");
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Grant failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="text-[15px]">Add a member</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Email">
              <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. sara@yourcompany.com" />
            </Field>
            <Field label="Name (optional)">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sara Khan" />
            </Field>
            <Field label="Password" hint="At least 8 characters. Not needed if they already have an account.">
              <PasswordInput
                id="member-password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set their password"
              />
            </Field>
            <Field label="Role">
              <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">{ROLE_DESCRIPTIONS[role]}</p>
          <Button type="submit" variant="primary" className="mt-3" disabled={busy || !email}>
            Grant access
          </Button>
          {notice ? (
            <p role="status" className="mt-3 rounded-[7px] bg-[var(--chip-bg)] p-3 text-sm">
              {notice}
            </p>
          ) : null}
          <FormError message={error} />
        </form>
      </Card>

      <Card>
        <h2 className="text-[15px]">Active members</h2>
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {pageItems.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {m.name} {m.userId === user?.id ? <span className="text-[var(--muted)]">(you)</span> : null}
                </p>
                <p className="text-[var(--muted)]">
                  {m.email} · {ROLE_LABELS[m.role] ?? m.role}
                </p>
              </div>
              {m.userId !== user?.id ? (
                confirmRevoke === m.id ? (
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await revokeMembership(workspaceId, m.id);
                          setConfirmRevoke(null);
                          await refresh();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Revoke failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Confirm revoke
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmRevoke(null)}>
                      Keep
                    </Button>
                  </div>
                ) : confirmReset === m.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <PasswordInput
                      id={`reset-password-${m.id}`}
                      autoComplete="new-password"
                      aria-label={`New password for ${m.email}`} wrapperClassName="w-56"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="New password (8+ characters)"
                    />
                    <Button
                      variant="primary"
                      disabled={busy || resetPassword.length < 8}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        setNotice(null);
                        try {
                          await resetMemberPassword(workspaceId, m.id, resetPassword);
                          setNotice(`New password set for ${m.email}. They were signed out and can sign in with it now.`);
                          setResetPassword("");
                          setConfirmReset(null);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Reset failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Set password
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setConfirmReset(null);
                        setResetPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setConfirmReset(m.id)}>
                      Reset password
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmRevoke(m.id)}>
                      Revoke access
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          ))}
          {!rows.length ? <li className="py-3 text-sm text-[var(--muted)]">No active members.</li> : null}
        </ul>
        {pager}
      </Card>
    </div>
  );
}

export default function MembersPage() {
  return <RequireCap cap="manage_membership">{(workspaceId) => <Members workspaceId={workspaceId} />}</RequireCap>;
}
