"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Building2,
  CalendarDays,
  CircleCheck,
  Gauge,
  Boxes,
  Plug,
  Users,
  type LucideIcon,
} from "lucide-react";
import { CrmChip } from "@/components/platform/CrmChip";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { Card } from "@/components/ui/Card";
import { initials, toneFor } from "@/components/platform/CompanyCards";
import { ROLE_LABELS } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils/dates";
import { getPlatformOverview, type PlatformCompany, type PlatformOverview } from "@/lib/api/platform";

const ROLE_ORDER = ["tenant_admin", "researcher", "sales_reviewer", "sdr", "partner", "analyst"];

function usagePct(c: Pick<PlatformCompany, "researchUsedMonthly" | "researchQuotaMonthly">) {
  return c.researchQuotaMonthly ? Math.min(100, (c.researchUsedMonthly / c.researchQuotaMonthly) * 100) : 0;
}

function barTone(pct: number) {
  return pct >= 90 ? "bg-[var(--red)]" : pct >= 70 ? "bg-[var(--badge-amber-fg)]" : "bg-[var(--navy)]";
}

function Avatar({ c, size = "h-9 w-9" }: { c: PlatformCompany; size?: string }) {
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-[9px] text-xs font-bold ${toneFor(c.id)}`}
      aria-hidden
    >
      {initials(c.name)}
    </span>
  );
}

function StatTile({ Icon, label, value, hint }: { Icon: LucideIcon; label: string; value: number; hint: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--chip-bg)] text-[var(--navy)]" aria-hidden>
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-[var(--foreground)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
    </div>
  );
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-[15px]">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Platform overview: totals across every company, research usage, role mix and newest companies. */
export default function PlatformOverviewPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformOverview()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the overview"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const roleTotals: Record<string, number> = {};
  let used = 0;
  let quota = 0;
  for (const c of data.companies) {
    for (const [r, n] of Object.entries(c.membersByRole)) roleTotals[r] = (roleTotals[r] ?? 0) + n;
    used += c.researchUsedMonthly;
    quota += c.researchQuotaMonthly;
  }
  const totalPct = quota ? Math.min(100, (used / quota) * 100) : 0;
  const roleMax = Math.max(1, ...ROLE_ORDER.map((r) => roleTotals[r] ?? 0));
  const roleSum = ROLE_ORDER.reduce((a, r) => a + (roleTotals[r] ?? 0), 0);

  const byUsage = [...data.companies].sort((a, b) => usagePct(b) - usagePct(a) || b.researchUsedMonthly - a.researchUsedMonthly);
  const topUsers = byUsage.filter((c) => c.researchUsedMonthly > 0).slice(0, 5);
  const nearLimit = byUsage.filter((c) => usagePct(c) >= 90);
  const watch = byUsage.filter((c) => usagePct(c) >= 70 && usagePct(c) < 90);
  const recent = [...data.companies].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Overview"
        description="Every customer company on SignalApp, as counts only. Their accounts, evidence and briefs stay private to each company."
        actions={
          <Link
            href="/platform/companies"
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[var(--red)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--red-active)]"
          >
            <Building2 size={16} aria-hidden />
            Manage companies
          </Link>
        }
      />

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatTile Icon={Building2} label="Companies" value={data.totals.companies} hint="Customer tenants" />
        <StatTile Icon={Boxes} label="Workspaces" value={data.totals.workspaces} hint="Across all companies" />
        <StatTile Icon={Users} label="Active members" value={data.totals.members} hint="People with access" />
        <StatTile Icon={Briefcase} label="Accounts" value={data.totals.accounts} hint="Tracked target accounts" />
        <StatTile
          Icon={Plug}
          label="CRM connected"
          value={data.totals.crmConnected}
          hint={`of ${data.totals.companies} compan${data.totals.companies === 1 ? "y" : "ies"}`}
        />
      </div>

      {/* Research usage */}
      <Card>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <Gauge size={14} aria-hidden />
              Research units this month
            </div>
            <p className="mt-3 text-4xl font-semibold tabular-nums text-[var(--foreground)]">
              {used}
              <span className="ml-1.5 text-base font-normal text-[var(--muted)]">/ {quota} units</span>
            </p>
            <div
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--chip-bg)]"
              role="progressbar"
              aria-label="Total research usage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(totalPct)}
            >
              <div className={`h-full rounded-full ${barTone(totalPct)}`} style={{ width: `${Math.max(totalPct, totalPct ? 2 : 0)}%` }} />
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {Math.round(totalPct)}% of the combined monthly limit · {Math.max(0, quota - used)} units left
            </p>
          </div>

          <div className="lg:border-l lg:border-[var(--line)] lg:pl-6">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Top usage by company</p>
            {topUsers.length ? (
              <ul className="mt-3 space-y-3">
                {topUsers.map((c) => {
                  const pct = usagePct(c);
                  return (
                    <li key={c.id} className="flex items-center gap-3">
                      <Avatar c={c} size="h-7 w-7" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium text-[var(--foreground)]" title={c.name}>
                            {c.name}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                            <span className="font-semibold text-[var(--foreground)]">{c.researchUsedMonthly}</span> /{" "}
                            {c.researchQuotaMonthly}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--chip-bg)]" aria-hidden>
                          <div className={`h-full rounded-full ${barTone(pct)}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">No research has been run this month yet.</p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Role mix */}
        <Card>
          <SectionTitle title="Members by role" description={`${roleSum} active memberships across all companies.`} />
          <ul className="mt-4 space-y-3">
            {ROLE_ORDER.map((r) => {
              const n = roleTotals[r] ?? 0;
              return (
                <li key={r} className="grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
                  <span className="truncate text-[var(--foreground)]">{ROLE_LABELS[r]}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-[var(--chip-bg)]" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-[var(--navy)]"
                      style={{ width: `${n ? Math.max((n / roleMax) * 100, 3) : 0}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Attention */}
        <Card>
          <SectionTitle title="Needs attention" description="Companies close to their monthly research limit." />
          {nearLimit.length || watch.length ? (
            <ul className="mt-4 space-y-2">
              {[...nearLimit, ...watch].map((c) => {
                const pct = usagePct(c);
                const critical = pct >= 90;
                return (
                  <li
                    key={c.id}
                    className={`flex items-center gap-3 rounded-[10px] border px-3 py-2.5 ${
                      critical
                        ? "border-[var(--red-tint)] bg-[var(--red-tint)]"
                        : "border-[var(--badge-amber-bg)] bg-[var(--badge-amber-bg)]"
                    }`}
                  >
                    <AlertTriangle
                      size={16}
                      className={`shrink-0 ${critical ? "text-[var(--red-active)]" : "text-[var(--badge-amber-fg)]"}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]">{c.name}</span>
                    <span
                      className={`shrink-0 text-xs font-semibold tabular-nums ${
                        critical ? "text-[var(--red-active)]" : "text-[var(--badge-amber-fg)]"
                      }`}
                    >
                      {c.researchUsedMonthly} / {c.researchQuotaMonthly} · {Math.round(pct)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-4 flex items-center gap-3 rounded-[10px] bg-[var(--badge-green-bg)] px-4 py-3 text-sm text-[var(--badge-green-fg)]">
              <CircleCheck size={18} className="shrink-0" aria-hidden />
              All companies are well within their research limits.
            </div>
          )}
          {nearLimit.length ? (
            <Link
              href="/platform/companies"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--red-active)] hover:underline"
            >
              Reset usage on the Companies page
              <ArrowRight size={14} aria-hidden />
            </Link>
          ) : null}
        </Card>
      </div>

      {/* Newest companies */}
      <Card>
        <SectionTitle
          title="Newest companies"
          action={
            <Link
              href="/platform/companies"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--red-active)] hover:underline"
            >
              View all companies
              <ArrowRight size={14} aria-hidden />
            </Link>
          }
        />
        {recent.length ? (
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {recent.map((c) => {
              const pct = usagePct(c);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar c={c} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]" title={c.name}>
                        {c.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)]">
                        <CalendarDays size={12} aria-hidden />
                        Joined {formatDate(c.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-xs text-[var(--muted)] tabular-nums">
                    <span className="flex items-center gap-1" title="Workspaces">
                      <Boxes size={13} aria-hidden />
                      <span className="font-semibold text-[var(--foreground)]">{c.workspaces}</span>
                    </span>
                    <span className="flex items-center gap-1" title="Members">
                      <Users size={13} aria-hidden />
                      <span className="font-semibold text-[var(--foreground)]">{c.members}</span>
                    </span>
                    <span className="flex items-center gap-1" title="Accounts">
                      <Briefcase size={13} aria-hidden />
                      <span className="font-semibold text-[var(--foreground)]">{c.accounts}</span>
                    </span>
                    <CrmChip crm={c.crm} />
                    <span className="w-28" title="Research this month">
                      <span className="block text-right">
                        <span className="font-semibold text-[var(--foreground)]">{c.researchUsedMonthly}</span> /{" "}
                        {c.researchQuotaMonthly} units
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--chip-bg)]" aria-hidden>
                        <span className={`block h-full rounded-full ${barTone(pct)}`} style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            No companies yet.{" "}
            <Link href="/platform/companies" className="text-[var(--red-active)] hover:underline">
              Add the first one
            </Link>
            .
          </p>
        )}
      </Card>
    </div>
  );
}
