"use client";

import { useEffect, useState } from "react";
import { Building2, Boxes, Search, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { Card } from "@/components/ui/Card";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils/dates";
import { getPlatformUsers, type PlatformUsersCompany } from "@/lib/api/platform";
import { usePagination } from "@/components/ui/Pagination";

type Data = Awaited<ReturnType<typeof getPlatformUsers>>;

function Tile({ Icon, label, value }: { Icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-white px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--chip-bg)] text-[var(--navy)]" aria-hidden>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-[var(--foreground)]">{value}</p>
      </div>
    </div>
  );
}

function CompanyUsers({ c }: { c: PlatformUsersCompany }) {
  const roles = ROLE_ORDER.filter((r) => c.usersByRole[r]);
  return (
    <Card className="!p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px]">{c.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">Joined {formatDate(c.createdAt)}</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Users</p>
            <p className="text-xl font-semibold tabular-nums">{c.users}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Workspaces</p>
            <p className="text-xl font-semibold tabular-nums">{c.workspaces.length}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Tenant admins</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {c.admins.map((a) => (
              <li key={a.userId}>
                <span className="font-medium">{a.name}</span> <span className="text-[var(--muted)]">· {a.email}</span>
              </li>
            ))}
            {!c.admins.length ? <li className="text-[var(--red-active)]">No tenant admin</li> : null}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Users by role</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {roles.map((r) => (
              <span key={r} className="rounded-full bg-[var(--chip-bg)] px-2.5 py-0.5 text-xs text-[var(--badge-default-fg)]">
                {ROLE_LABELS[r] ?? r} <span className="font-semibold tabular-nums">{c.usersByRole[r]}</span>
              </span>
            ))}
            {!roles.length ? <span className="text-sm text-[var(--muted)]">No users</span> : null}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Users per workspace</p>
          <ul className="mt-1.5 divide-y divide-[var(--line)] text-sm">
            {c.workspaces.map((w) => (
              <li key={w.id} className="flex justify-between gap-3 py-1">
                <span className="truncate">{w.name}</span>
                <span className="font-semibold tabular-nums">{w.users}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** Users across companies: counts by role and workspace, plus each company's tenant admin contacts. */
export default function PlatformUsersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = (data?.companies ?? []).filter(
    (c) =>
      !needle ||
      c.name.toLowerCase().includes(needle) ||
      c.admins.some((a) => a.name.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle)),
  );
  const { pageItems, pager, topRef } = usePagination(shown);

  useEffect(() => {
    getPlatformUsers()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load users"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description="How many people each company has, by role and workspace. Only tenant admins are named; everyone else stays a count."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile Icon={Users} label="Users" value={data.totals.users} />
        <Tile Icon={ShieldCheck} label="Tenant admins" value={data.totals.admins} />
        <Tile Icon={Building2} label="Companies" value={data.totals.companies} />
        <Tile Icon={Boxes} label="Workspaces" value={data.totals.workspaces} />
      </div>

      <div className="relative w-full max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
        <input
          aria-label="Search companies or admins"
          className="w-full rounded-[9px] border border-[var(--input-border)] bg-white py-2.5 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--navy)] focus:ring-2 focus:ring-[var(--badge-blue-bg)]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, admin name or email"
        />
      </div>

      <div ref={topRef} className="scroll-mt-24 space-y-4">
        {pageItems.map((c) => (
          <CompanyUsers key={c.id} c={c} />
        ))}
        {!shown.length ? <p className="text-sm text-[var(--muted)]">{q ? "Nothing matches that search." : "No companies yet."}</p> : null}
      </div>
      {pager}
    </div>
  );
}
