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
import { Modal } from "@/components/ui/Modal";
import { ListFilter, UserPlus } from "lucide-react";

const ROLES = ["tenant_admin", "researcher", "sdr", "sales_reviewer", "partner", "analyst"] as const;

function Members({ workspaceId }: { workspaceId: string }) {
  const { user } = useWorkspace();
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("researcher");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  // Filter the list by role ("" = everyone)
  const [roleFilter, setRoleFilter] = useState("");
  const shown = roleFilter ? rows.filter((m) => m.role === roleFilter) : rows;
  const { pageItems, pager } = usePagination(shown);
  const countByRole = (r: string) => rows.filter((m) => m.role === r).length;

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

  const closeAdd = () => {
    setAdding(false);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access"
        title="Workspace members"
        description="Access comes only from an explicit membership — belonging to an organization never grants it. Agency users get delegated membership here too. Revoking takes effect on their next request."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setNotice(null);
              setError(null);
              setAdding(true);
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <UserPlus size={16} aria-hidden /> Add member
            </span>
          </Button>
        }
      />

      {notice ? (
        <p role="status" className="rounded-[10px] bg-[var(--badge-green-bg)] px-4 py-3 text-sm text-[var(--badge-green-fg)]">
          {notice}
        </p>
      ) : null}
      {!adding ? <FormError message={error} /> : null}

      <Modal
        open={adding}
        onClose={closeAdd}
        title="Add a member"
        description="They can sign in straight away with the password you set, and change it under Settings → Password."
        footer={
          <>
            <Button onClick={closeAdd}>Cancel</Button>
            <Button type="submit" form="add-member-form" variant="primary" disabled={busy || !email}>
              {busy ? "Adding…" : "Grant access"}
            </Button>
          </>
        }
      >
        <form
          id="add-member-form"
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
              setAdding(false);
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Grant failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
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
          <p className="mt-3 rounded-[8px] bg-[var(--chip-bg)] px-3 py-2 text-xs text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">{ROLE_LABELS[role]}:</strong> {ROLE_DESCRIPTIONS[role]}
          </p>
          <div className="mt-3">
            <FormError message={error} />
          </div>
        </form>
      </Modal>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px]">
            Active members{" "}
            <span className="text-sm font-normal text-[var(--muted)]">
              {roleFilter ? `${shown.length} of ${rows.length}` : rows.length}
            </span>
          </h2>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <ListFilter size={16} aria-hidden />
            <span className="sr-only">Filter by role</span>
            <select
              className="rounded-[8px] border border-[var(--input-border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All roles ({rows.length})</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]} ({countByRole(r)})
                </option>
              ))}
            </select>
          </label>
        </div>
        {roleFilter && !shown.length ? (
          <p className="mt-4 rounded-[8px] bg-[var(--chip-bg)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            No {ROLE_LABELS[roleFilter] ?? roleFilter} members yet.{" "}
            <button type="button" className="font-medium text-[var(--red-active)] hover:underline" onClick={() => setRoleFilter("")}>
              Show everyone
            </button>
          </p>
        ) : null}
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
