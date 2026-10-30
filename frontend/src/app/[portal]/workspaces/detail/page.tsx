"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Field, FormError, inputClass } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePagination } from "@/components/ui/Pagination";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_ORDER } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils/dates";
import type { MembershipRow } from "@/lib/api/memberships";
import { addWorkspaceMember, listWorkspaceMembers, revokeWorkspaceMember } from "@/lib/api/companyWorkspaces";

const EMPTY = { email: "", name: "", role: "researcher", password: "" };

function WorkspaceUsers({ workspaceId, targetId }: { workspaceId: string; targetId: string }) {
  const router = useRouter();
  const { user, workspaces, selectWorkspace, refresh: refreshSwitcher } = useWorkspace();
  const [ws, setWs] = useState<{ name: string; createdAt: string } | null>(null);
  const [rows, setRows] = useState<MembershipRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const shown = (rows ?? [])
    .filter((m) => !roleFilter || m.role === roleFilter)
    .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const { pageItems, pager } = usePagination(shown);

  const refresh = useCallback(async () => {
    try {
      const res = await listWorkspaceMembers(workspaceId, targetId);
      setWs(res.workspace);
      setRows(res.memberships);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the workspace");
    }
  }, [workspaceId, targetId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loadError) return <ErrorState message={loadError} />;
  if (!rows || !ws) return <LoadingState />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const byRole: Record<string, number> = {};
  for (const m of rows) byRole[m.role] = (byRole[m.role] ?? 0) + 1;
  const canOpen = targetId !== workspaceId && workspaces.some((w) => w.id === targetId);

  return (
    <div className="space-y-6">
      <Link href="/workspaces" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
        <ArrowLeft size={15} aria-hidden />
        All workspaces
      </Link>

      <PageHeader
        eyebrow="Workspace"
        title={ws.name}
        description={`Created ${formatDate(ws.createdAt)}. Users here can only see this workspace's accounts and work, within what their role allows.`}
        actions={
          <>
            {canOpen ? (
              <Button
                variant="ghost"
                onClick={() => {
                  selectWorkspace(targetId);
                  router.push("/home");
                }}
              >
                Switch to this workspace
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => {
                setError(null);
                setAdding(true);
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <UserPlus size={16} aria-hidden /> Add user
              </span>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <Card className="!p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">All users</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{rows.length}</p>
        </Card>
        {ROLE_ORDER.map((r) => (
          <Card key={r} className="!p-4">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{byRole[r] ?? 0}</p>
          </Card>
        ))}
      </div>

      {notice ? (
        <p role="status" className="rounded-[7px] bg-[var(--chip-bg)] p-3 text-sm">
          {notice}
        </p>
      ) : null}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Add a user to ${ws.name}`}
        description="They can sign in straight away with the password you set, and change it under Settings → Password."
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" form="add-ws-user-form" variant="primary" disabled={busy || !form.email}>
              {busy ? "Adding…" : "Grant access"}
            </Button>
          </>
        }
      >
        <form
          id="add-ws-user-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            setNotice(null);
            try {
              const res = await addWorkspaceMember(workspaceId, targetId, {
                email: form.email,
                name: form.name || undefined,
                role: form.role,
                password: form.password || undefined,
              });
              setNotice(
                res.existingAccount
                  ? `${form.email} already had a SignalApp account, so they keep their own password and can open ${ws.name} now.`
                  : `${form.email} can sign in now with the password you set. They can change it under Settings → Password.`,
              );
              setForm(EMPTY);
              setAdding(false);
              await refresh();
              // The admin may have added themselves; keep the switcher in step
              if (form.email.trim().toLowerCase() === user?.email.toLowerCase()) await refreshSwitcher();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not add the user");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <input type="email" required className={inputClass} value={form.email} onChange={set("email")} placeholder="e.g. sara@yourcompany.com" />
            </Field>
            <Field label="Name (optional)">
              <input className={inputClass} value={form.name} onChange={set("name")} placeholder="e.g. Sara Khan" />
            </Field>
            <Field label="Password" hint="At least 8 characters. Not needed if they already have an account.">
              <PasswordInput id="ws-user-password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} placeholder="Set their password" />
            </Field>
            <Field label="Role">
              <select className={inputClass} value={form.role} onChange={set("role")}>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-3 rounded-[8px] bg-[var(--chip-bg)] px-3 py-2 text-xs text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">{ROLE_LABELS[form.role]}:</strong> {ROLE_DESCRIPTIONS[form.role]}
          </p>
          <div className="mt-3">
            <FormError message={error} />
          </div>
        </form>
      </Modal>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px]">Users</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
              <input aria-label="Search users" className={`${inputClass} !mt-0 !pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
            </div>
            <select aria-label="Filter by role" className={`${inputClass} !mt-0 w-44`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]} ({byRole[r] ?? 0})
                </option>
              ))}
            </select>
          </div>
        </div>
        {!adding ? <FormError message={error} /> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr className="border-b border-[var(--line)]">
                <th className="py-2 pr-4 font-semibold">Name</th>
                <th className="py-2 pr-4 font-semibold">Email</th>
                <th className="py-2 pr-4 font-semibold">Role</th>
                <th className="py-2 pr-4 font-semibold">Added</th>
                <th className="py-2 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {pageItems.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 pr-4 font-medium">
                    {m.name} {m.userId === user?.id ? <span className="font-normal text-[var(--muted)]">(you)</span> : null}
                  </td>
                  <td className="py-3 pr-4">{m.email}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded-full bg-[var(--chip-bg)] px-2.5 py-0.5 text-xs text-[var(--badge-default-fg)]">{ROLE_LABELS[m.role] ?? m.role}</span>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{formatDate(m.createdAt)}</td>
                  <td className="py-3 text-right">
                    {m.userId === user?.id ? null : confirmRevoke === m.id ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            setError(null);
                            try {
                              await revokeWorkspaceMember(workspaceId, targetId, m.id);
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
                    ) : (
                      <Button variant="ghost" onClick={() => setConfirmRevoke(m.id)}>
                        Revoke access
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!shown.length ? (
                <tr>
                  <td colSpan={5} className="py-3 text-[var(--muted)]">
                    {rows.length ? "No user matches." : "No users in this workspace yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {pager}
      </Card>
    </div>
  );
}

export default function WorkspaceDetailPage() {
  const id = useSearchParams().get("id") ?? "";
  return (
    <RequireCap cap="manage_membership">{(workspaceId) => <WorkspaceUsers workspaceId={workspaceId} targetId={id} />}</RequireCap>
  );
}
