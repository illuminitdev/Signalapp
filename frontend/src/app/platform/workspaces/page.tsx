"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, inputClass } from "@/components/ui/Field";
import { formatDate } from "@/lib/utils/dates";
import {
  createWorkspace,
  getPlatformOverview,
  listPlatformWorkspaces,
  type PlatformCompany,
  type PlatformWorkspace,
} from "@/lib/api/platform";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { usePagination } from "@/components/ui/Pagination";

const EMPTY = { tenantId: "", name: "", adminEmail: "", adminName: "", adminPassword: "" };

export default function PlatformWorkspacesPage() {
  const [rows, setRows] = useState<PlatformWorkspace[] | null>(null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; admins: string[]; existingAccount: boolean } | null>(null);
  const shown = filter ? (rows ?? []).filter((w) => w.tenantId === filter) : (rows ?? []);
  const { pageItems, pager } = usePagination(shown);

  const refresh = useCallback(async () => {
    try {
      const [ws, ov] = await Promise.all([listPlatformWorkspaces(), getPlatformOverview()]);
      setRows(ws.workspaces);
      setCompanies(ov.companies);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspaces");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Workspaces"
        description="Team areas inside each company. A new workspace starts empty: no accounts, evidence or tasks, and its own offer, members and settings."
        actions={
          !adding ? (
            <Button variant="primary" onClick={() => setAdding(true)} disabled={!companies.length}>
              Add workspace
            </Button>
          ) : null
        }
      />

      {created ? (
        <div role="status" className="rounded-[10px] border border-[var(--line)] bg-white p-4 text-sm">
          <p className="font-semibold">Created workspace {created.name}.</p>
          <p className="mt-1">Admin access: {created.admins.join(", ")}.</p>
          <p className="mt-1 text-[var(--muted)]">
            {created.existingAccount
              ? "They'll see it in the workspace switcher next time they open SignalApp."
              : `${created.admins[0]} can sign in now with the password you set.`}
          </p>
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
                const res = await createWorkspace({
                  tenantId: form.tenantId,
                  name: form.name,
                  adminEmail: form.adminEmail || undefined,
                  adminName: form.adminName || undefined,
                  adminPassword: form.adminPassword || undefined,
                });
                setCreated({ name: form.name, admins: res.adminEmails, existingAccount: res.existingAccount });
                setForm(EMPTY);
                setAdding(false);
                await refresh();
              } catch (err) {
                setFormError(err instanceof Error ? err.message : "Could not add the workspace");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="text-[15px]">Add a workspace</h2>
            <p className="text-sm text-[var(--muted)]">
              Leave the admin email blank to give the company&apos;s current tenant admins access. Enter an email to make someone
              else the admin; set a password if that email is new to SignalApp.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company">
                <select id="ws-company" required className={inputClass} value={form.tenantId} onChange={set("tenantId")}>
                  <option value="">Choose a company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Workspace name">
                <input id="ws-name" required className={inputClass} value={form.name} onChange={set("name")} placeholder="e.g. Ireland Sales" />
              </Field>
              <Field label="Workspace admin email (optional)">
                <input id="ws-admin-email" type="email" className={inputClass} value={form.adminEmail} onChange={set("adminEmail")} placeholder="Blank = company's tenant admins" />
              </Field>
              <Field label="Admin name (optional)">
                <input id="ws-admin-name" className={inputClass} value={form.adminName} onChange={set("adminName")} placeholder="e.g. Sean Murphy" />
              </Field>
              {form.adminEmail ? (
                <Field label="Admin password" hint="Needed for a new email (8+ characters). An existing account keeps its own password.">
                  <PasswordInput id="ws-admin-password" minLength={8} autoComplete="new-password" value={form.adminPassword} onChange={set("adminPassword")} placeholder="Set their password" />
                </Field>
              ) : null}
            </div>
            <FormError message={formError} />
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy || !form.tenantId || !form.name}>
                {busy ? "Creating…" : "Create workspace"}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <label className="block w-full max-w-sm text-xs font-semibold text-[var(--muted)]">
          Company
          <select id="ws-filter" className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr className="border-b border-[var(--line)]">
                <th className="py-2 pr-4 font-semibold">Workspace</th>
                <th className="py-2 pr-4 font-semibold">Company</th>
                <th className="py-2 pr-4 font-semibold">Members</th>
                <th className="py-2 pr-4 font-semibold">Accounts</th>
                <th className="py-2 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] tabular-nums">
              {pageItems.map((w) => (
                <tr key={w.id}>
                  <td className="py-3 pr-4 font-medium">{w.name}</td>
                  <td className="py-3 pr-4">{w.companyName}</td>
                  <td className="py-3 pr-4">{w.members}</td>
                  <td className="py-3 pr-4">
                    {w.accounts}
                    {!w.accounts ? <span className="ml-2 text-xs text-[var(--muted)]">empty</span> : null}
                  </td>
                  <td className="py-3">{formatDate(w.createdAt)}</td>
                </tr>
              ))}
              {!shown.length ? (
                <tr>
                  <td colSpan={5} className="py-3 text-[var(--muted)]">
                    No workspaces yet.
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
