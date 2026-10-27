import { Briefcase, CalendarDays, Layers, Users, type LucideIcon } from "lucide-react";
import { ROLE_LABELS } from "@/lib/auth/capabilities";
import { formatDate } from "@/lib/utils/dates";
import type { PlatformCompany } from "@/lib/api/platform";
import { usePagination } from "@/components/ui/Pagination";

const AVATAR_TONES = [
  "bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]",
  "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]",
  "bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]",
  "bg-[var(--red-tint)] text-[var(--red-active)]",
  "bg-[var(--badge-default-bg)] text-[var(--badge-default-fg)]",
];

/** Same company, same colour, on every visit. */
function toneFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Stat({ Icon, label, value }: { Icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        <Icon size={13} aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function CompanyCard({ c }: { c: PlatformCompany }) {
  const pct = c.researchQuotaMonthly ? Math.min(100, (c.researchUsedMonthly / c.researchQuotaMonthly) * 100) : 0;
  const barTone = pct >= 90 ? "bg-[var(--red)]" : pct >= 70 ? "bg-[var(--badge-amber-fg)]" : "bg-[var(--navy)]";
  const roles = Object.entries(c.membersByRole).sort(([a], [b]) => (ROLE_LABELS[a] ?? a).localeCompare(ROLE_LABELS[b] ?? b));

  return (
    <article className="flex flex-col rounded-[12px] border border-[var(--line)] bg-white p-5 transition-shadow hover:shadow-[0_6px_20px_-8px_rgba(23,44,64,0.18)]">
      <header className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold ${toneFor(c.id)}`}
          aria-hidden
        >
          {initials(c.name)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] text-[var(--foreground)]" title={c.name}>
            {c.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)]">
            <CalendarDays size={12} aria-hidden />
            Joined {formatDate(c.createdAt)}
          </p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-3 divide-x divide-[var(--line)]">
        <Stat Icon={Layers} label="Workspaces" value={c.workspaces} />
        <Stat Icon={Users} label="Members" value={c.members} />
        <Stat Icon={Briefcase} label="Accounts" value={c.accounts} />
      </div>

      <div className="mt-4 flex min-h-[26px] flex-wrap gap-1.5">
        {roles.length ? (
          roles.map(([r, n]) => (
            <span
              key={r}
              className="rounded-full bg-[var(--chip-bg)] px-2.5 py-0.5 text-xs text-[var(--badge-default-fg)]"
            >
              {ROLE_LABELS[r] ?? r} <span className="font-semibold tabular-nums">{n}</span>
            </span>
          ))
        ) : (
          <span className="text-xs text-[var(--muted)]">No members yet</span>
        )}
      </div>

      <div className="mt-auto pt-5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-[var(--muted)]">Research this month</span>
          <span className="tabular-nums text-[var(--foreground)]">
            <span className="font-semibold">{c.researchUsedMonthly}</span> / {c.researchQuotaMonthly} units
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--chip-bg)]"
          role="progressbar"
          aria-label={`${c.name} research usage`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.max(pct, pct ? 2 : 0)}%` }} />
        </div>
      </div>
    </article>
  );
}

/** Card grid of companies (counts only), used on the Companies page. */
export function CompanyCards({ companies, empty }: { companies: PlatformCompany[]; empty: React.ReactNode }) {
  const { pageItems, pager } = usePagination(companies);
  if (!companies.length) {
    return (
      <div className="rounded-[12px] border border-dashed border-[var(--input-border)] bg-white px-6 py-12 text-center text-sm text-[var(--muted)]">
        {empty}
      </div>
    );
  }
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pageItems.map((c) => (
          <CompanyCard key={c.id} c={c} />
        ))}
      </div>
      {pager}
    </div>
  );
}
