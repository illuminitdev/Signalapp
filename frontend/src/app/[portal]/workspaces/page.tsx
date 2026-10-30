"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalLink as Link } from "@/components/layout/PortalLink";
import { Briefcase, CalendarDays, ChevronRight, CircleCheck, Boxes, Plus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, inputClass } from "@/components/ui/Field";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePagination } from "@/components/ui/Pagination";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils/dates";
import { createCompanyWorkspace, listCompanyWorkspaces, type CompanyWorkspace } from "@/lib/api/companyWorkspaces";

function WorkspaceCard({ w, current }: { w: CompanyWorkspace; current: boolean }) {
  const roles = ROLE_ORDER.filter((r) => w.membersByRole[r]);
  return (
    <Link
      href={`/workspaces/detail?id=${w.id}`}
      prefetch
      className="group flex flex-col rounded-[12px] border border-[var(--line)] bg-white p-5 transition-shadow hover:shadow-[0_6px_20px_-8px_rgba(23,44,64,0.18)]"
    >
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--chip-bg)] text-[var(--navy)]" aria-hidden>
          <Boxes size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] text-[var(--foreground)]" title={w.name}>
            {w.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)]">
            <CalendarDays size={12} aria-hidden />
            Created {formatDate(w.createdAt)}
          </p>
        </div>
        {current ? <Badge tone="red">Current</Badge> : w.isMember ? <Badge tone="green">You have access</Badge> : <Badge>No access</Badge>}
      </header>

      <div className="mt-5 grid grid-cols-2 divide-x divide-[var(--line)]">
        <div className="pr-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Users size={13} aria-hidden />
            Users
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{w.members}</p>
        </div>
        <div className="pl-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Briefcase size={13} aria-hidden />
            Accounts
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{w.accounts}</p>
        </div>
      </div>

      <div className="mt-4 flex min-h-[26px] flex-wrap gap-1.5">
        {roles.length ? (
          roles.map((r) => (
            <span key={r} className="rounded-full bg-[var(--chip-bg)] px-2.5 py-0.5 text-xs text-[var(--badge-default-fg)]">
              {ROLE_LABELS[r] ?? r} <span className="font-semibold tabular-nums">{w.membersByRole[r]}</span>
            </span>
          ))
        ) : (
          <span className="text-xs text-[var(--muted)]">No users yet</span>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1 border-t border-[var(--line)] pt-3 text-sm font-medium text-[var(--red-active)]">
        View users
        <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
      </p>
    </Link>
  );
}

function Workspaces({ workspaceId }: { workspaceId: string }) {
  const { refresh: refreshSwitcher } = useWorkspace();
  const [rows, setRows] = useState<CompanyWorkspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; admins: string[] } | null>(null);
  const { pageItems, pager } = usePagination(rows ?? []);

  const refresh = useCallback(async () => {
    try {
      setRows((await listCompanyWorkspaces(workspaceId)).workspaces);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspaces");
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState />;

  const totalUsers = rows.reduce((a, w) => a + w.members, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Workspaces"
        description="Every workspace in your company. Each one has its own accounts, offer, settings and users. A new workspace starts empty."
        actions={
          !adding ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Plus size={16} aria-hidden />
                Add workspace
              </span>
            </Button>
          ) : null
        }
      />

      {created ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-[12px] border border-[var(--badge-green-bg)] bg-[var(--badge-green-bg)] p-4 text-sm text-[var(--badge-green-fg)]"
        >
          <CircleCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Created workspace {created.name}.</p>
            <p className="mt-1">
              Admin access: {created.admins.join(", ")}. It&apos;s in the workspace switcher now; open it below to add users.
            </p>
          </div>
          <button type="button" onClick={() => setCreated(null)} className="shrink-0 rounded p-0.5 hover:bg-white/60" aria-label="Dismiss">
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : null}

      {adding ? (
        <Card accent>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setFormError(null);
              setCreated(null);
              try {
                const res = await createCompanyWorkspace(workspaceId, name);
                setCreated({ name, admins: res.adminEmails });
                setName("");
                setAdding(false);
                await Promise.all([refresh(), refreshSwitcher()]);
              } catch (err) {
                setFormError(err instanceof Error ? err.message : "Could not add the workspace");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="text-[15px]">Add a workspace</h2>
            <p className="text-sm text-[var(--muted)]">
              Every tenant admin in your company gets admin access to it. Add other users from the workspace once it&apos;s created.
            </p>
            <div className="max-w-md">
              <Field label="Workspace name">
                <input id="new-ws-name" required autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ireland Sales" />
              </Field>
            </div>
            <FormError message={formError} />
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create workspace"}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <p className="text-sm text-[var(--muted)]">
        {rows.length} {rows.length === 1 ? "workspace" : "workspaces"} · {totalUsers} {totalUsers === 1 ? "user" : "users"}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {pageItems.map((w) => (
          <WorkspaceCard key={w.id} w={w} current={w.id === workspaceId} />
        ))}
      </div>
      {pager}
    </div>
  );
}

export default function WorkspacesPage() {
  return <RequireCap cap="manage_membership">{(workspaceId) => <Workspaces workspaceId={workspaceId} />}</RequireCap>;
}
