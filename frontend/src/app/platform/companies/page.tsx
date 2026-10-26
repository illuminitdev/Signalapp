"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, inputClass } from "@/components/ui/Field";
import { Building2, CircleCheck, Gauge, Layers, Plus, Search, Users, X, type LucideIcon } from "lucide-react";
import { CompanyCards } from "@/components/platform/CompanyCards";
import { createCompany, getPlatformOverview, type PlatformCompany } from "@/lib/api/platform";
import { PasswordInput } from "@/components/ui/PasswordInput";

const EMPTY = { companyName: "", workspaceName: "", adminEmail: "", adminName: "", adminPassword: "" };

function SummaryTile({ Icon, label, value, suffix }: { Icon: LucideIcon; label: string; value: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-white px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--chip-bg)] text-[var(--navy)]" aria-hidden>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums text-[var(--foreground)]">
          {value}
          {suffix ? <span className="ml-1 text-xs font-normal text-[var(--muted)]">{suffix}</span> : null}
        </p>
      </div>
    </div>
  );
}

export default function PlatformCompaniesPage() {
  const [companies, setCompanies] = useState<PlatformCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ company: string; email: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCompanies((await getPlatformOverview()).companies);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load companies");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) return <ErrorState message={error} />;
  if (!companies) return <LoadingState />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const shown = companies.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const totals = companies.reduce(
    (t, c) => ({
      workspaces: t.workspaces + c.workspaces,
      members: t.members + c.members,
      used: t.used + c.researchUsedMonthly,
      quota: t.quota + c.researchQuotaMonthly,
    }),
    { workspaces: 0, members: 0, used: 0, quota: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Companies"
        description="Each company is a separate tenant with its own workspaces, members and data."
        actions={
          !adding ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Plus size={16} aria-hidden />
                Add company
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
            <p className="font-semibold">Added {created.company}.</p>
            <p className="mt-1">
              {created.email} can sign in now with the password you set. They can change it under Settings → Password.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="shrink-0 rounded p-0.5 hover:bg-white/60"
            aria-label="Dismiss"
          >
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
                const res = await createCompany({
                  companyName: form.companyName,
                  workspaceName: form.workspaceName || undefined,
                  adminEmail: form.adminEmail,
                  adminName: form.adminName || undefined,
                  adminPassword: form.adminPassword,
                });
                setCreated({ company: form.companyName, email: res.adminEmail });
                setForm(EMPTY);
                setAdding(false);
                await refresh();
              } catch (err) {
                setFormError(err instanceof Error ? err.message : "Could not add the company");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="text-[15px]">Add a company</h2>
            <p className="text-sm text-[var(--muted)]">
              Creates the company, its first workspace and its tenant admin. The tenant admin then adds their own team.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name">
                <input id="company-name" required className={inputClass} value={form.companyName} onChange={set("companyName")} placeholder="e.g. Northbridge Systems" />
              </Field>
              <Field label="First workspace (optional)">
                <input id="company-workspace" className={inputClass} value={form.workspaceName} onChange={set("workspaceName")} placeholder="Default Workspace" />
              </Field>
              <Field label="Tenant admin email">
                <input id="company-admin-email" type="email" required className={inputClass} value={form.adminEmail} onChange={set("adminEmail")} placeholder="e.g. priya@northbridge.co.uk" />
              </Field>
              <Field label="Tenant admin name (optional)">
                <input id="company-admin-name" className={inputClass} value={form.adminName} onChange={set("adminName")} placeholder="e.g. Priya Shah" />
              </Field>
              <Field label="Tenant admin password" hint="At least 8 characters. They can change it later in Settings.">
                <PasswordInput id="company-admin-password" required minLength={8} autoComplete="new-password" value={form.adminPassword} onChange={set("adminPassword")} placeholder="Set their password" />
              </Field>
            </div>
            <FormError message={formError} />
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy || !form.companyName || !form.adminEmail || form.adminPassword.length < 8}>
                {busy ? "Adding…" : "Add company"}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile Icon={Building2} label="Companies" value={companies.length} />
        <SummaryTile Icon={Layers} label="Workspaces" value={totals.workspaces} />
        <SummaryTile Icon={Users} label="Members" value={totals.members} />
        <SummaryTile
          Icon={Gauge}
          label="Research used"
          value={totals.used}
          suffix={`/ ${totals.quota} units`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
          <input
            id="company-search"
            aria-label="Search companies"
            className="w-full rounded-[9px] border border-[var(--input-border)] bg-white py-2.5 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--navy)] focus:ring-2 focus:ring-[var(--badge-blue-bg)]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies"
          />
        </div>
        <p className="text-sm text-[var(--muted)]">
          {q.trim()
            ? `${shown.length} of ${companies.length} companies`
            : `${companies.length} ${companies.length === 1 ? "company" : "companies"}`}
        </p>
      </div>

      <CompanyCards companies={shown} empty={q ? "No company matches that name." : "No companies yet."} />
    </div>
  );
}
