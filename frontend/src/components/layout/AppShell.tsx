"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ChartColumn,
  ChevronsUpDown,
  Compass,
  Inbox,
  Layers,
  LogOut,
  Send,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { logout } from "../../lib/auth/session";
import { ROLE_LABELS, type Capability } from "../../lib/auth/capabilities";
import { useWorkspace } from "../../hooks/useWorkspace";
import { SubNav, type SubNavItem } from "../ui/SubNav";
import { AttentionBell } from "./AttentionBell";

type Can = (cap: Capability) => boolean;

type Section = {
  key: string;
  label: string;
  Icon: LucideIcon;
  prefix: string;
  /** Section is shown when the member can see at least one sub-view */
  items: Array<SubNavItem & { visible: (can: Can) => boolean }>;
};

const SECTIONS: Section[] = [
  {
    key: "partner",
    label: "Shared with me",
    Icon: Inbox,
    prefix: "/partner",
    items: [
      {
        href: "/partner",
        label: "Shared handoffs",
       
        visible: (can) => can("acknowledge_handoff") && !can("view_accounts"),
      },
    ],
  },
  {
    key: "discover",
    label: "Discover",
    Icon: Compass,
    prefix: "/discover",
    items: [
      { href: "/discover/feed", label: "Opportunity feed", visible: (can) => can("discover") },
      { href: "/discover/search", label: "Search", visible: (can) => can("discover") },
      { href: "/discover/playbooks", label: "Playbooks", visible: (can) => can("discover") },
    ],
  },
  {
    key: "accounts",
    label: "Accounts",
    Icon: Building2,
    prefix: "/accounts",
    items: [
      { href: "/accounts/watchlist", label: "Watchlist & imports", visible: (can) => can("view_accounts") },
      {
        href: "/accounts/sales-acceptance",
        label: "Sales acceptance",
        visible: (can) => can("accept") || can("submit_review"),
      },
      { href: "/accounts/pipeline", label: "Pipeline", visible: (can) => can("view_accounts") },
      { href: "/accounts/monitors", label: "Monitors", visible: (can) => can("view_accounts") },
    ],
  },
  {
    key: "outreach",
    label: "Outreach",
    Icon: Send,
    prefix: "/outreach",
    items: [
      { href: "/outreach/tasks", label: "Tasks", visible: (can) => can("view_tasks") },
      { href: "/outreach/drafts", label: "Drafts", visible: (can) => can("view_drafts") },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    Icon: ChartColumn,
    prefix: "/reports",
    items: [
      { href: "/reports/outcomes", label: "Outcomes", visible: (can) => can("view_outcomes") },
    ],
  },
  {
    key: "members",
    label: "Members",
    Icon: Users,
    prefix: "/members",
    items: [{ href: "/members", label: "Members", visible: (can) => can("manage_membership") }],
  },
  {
    key: "workspaces",
    label: "Workspaces",
    Icon: Layers,
    prefix: "/workspaces",
    items: [{ href: "/workspaces", label: "Workspaces", visible: (can) => can("manage_membership") }],
  },
  {
    key: "settings",
    label: "Settings",
    Icon: Settings,
    prefix: "/settings",
    items: [
      { href: "/settings/offer", label: "Offer & targeting", visible: (can) => can("manage_settings") },
      { href: "/settings/suppressions", label: "Suppressions", visible: (can) => can("manage_suppressions") },
      {
        href: "/settings/connections",
        label: "Connections & usage",
       
        visible: (can) => can("manage_settings") || can("research"),
      },
      { href: "/settings/password", label: "Password", visible: () => true },
      { href: "/settings/how-it-works", label: "How it works", visible: () => true },
    ],
  },
];

/** Sections and sub-views this member may use, in navigation order. */
export function visibleSections(can: Can) {
  // Settings is always shown: every role can change their password there
  return SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.visible(can)) })).filter((s) => s.items.length > 0);
}

/** True when the path is in this section — its prefix or any of its own pages (e.g. /sales-reviewer under Accounts). */
export function inSection(section: Section, pathname: string) {
  return pathname.startsWith(section.prefix) || section.items.some((i) => pathname.startsWith(i.href));
}

/** Landing page for a member: first view their role can use. */
export function homeFor(can: Can): string {
  return visibleSections(can)[0]?.items[0]?.href ?? "/settings/how-it-works";
}


export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { can, role, user, workspaceName, workspaces, workspaceId, selectWorkspace } = useWorkspace();
  const sections = visibleSections(can);
  const current = sections.find((s) => inSection(s, pathname));
  const subItems = current?.items ?? [];
  const initials = (user?.name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-width)] flex-col border-r border-[var(--line)] bg-white">
        {/* Brand */}
        <Link href={homeFor(can)} prefetch className="flex h-16 shrink-0 items-center gap-2.5 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--red)] to-[var(--red-active)] text-white shadow-[0_2px_6px_rgba(187,33,48,0.35)]">
            <span className="text-[16px] font-bold leading-none" aria-hidden>
              S
            </span>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">SignalApp</span>
        </Link>

        {/* Workspace switcher */}
        <div className="px-3">
          <div className="relative flex items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
              <Layers size={15} strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">Workspace</p>
              <p className="truncate text-[13px] font-semibold leading-tight text-[var(--foreground)]">
                {workspaceName ?? "SignalApp"}
              </p>
            </div>
            {workspaces.length > 1 ? (
              <>
                <ChevronsUpDown size={15} className="shrink-0 text-[var(--muted)]" aria-hidden />
                {/* Native select over the card: accessible and keyboard-friendly */}
                <select
                  aria-label="Switch workspace"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={workspaceId ?? ""}
                  onChange={(e) => {
                    selectWorkspace(e.target.value);
                    // The portal redirects to the first view this role can use there
                    router.push("/discover/feed");
                  }}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Primary" className="mt-5 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          <p className="px-3 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">Menu</p>
          {sections.map((item) => {
            const active = inSection(item, pathname);
            const Icon = item.Icon;
            return (
              <Link
                key={item.key}
                href={item.items[0]!.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--red-tint)] text-[var(--red-active)]"
                    : "text-[#3d4a57] hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)]"
                }`}
              >
                {active ? (
                  <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--red-active)]" aria-hidden />
                ) : null}
                <Icon
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden
                  className={`shrink-0 ${active ? "text-[var(--red-active)]" : "text-[#7a8794] group-hover:text-[var(--foreground)]"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Profile */}
        <div className="border-t border-[var(--line)] p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[12px] font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">{user?.name ?? "Signed in"}</p>
              <p className="truncate text-[11.5px] text-[var(--muted)]">{ROLE_LABELS[role ?? ""] ?? role}</p>
            </div>
          </div>
          <button
            type="button"
            className="mt-1 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] text-[12.5px] font-medium text-[#3d4a57] transition-colors hover:border-[var(--red-tint)] hover:bg-[var(--red-tint)] hover:text-[var(--red-active)]"
            onClick={() => {
              // Leave immediately; the session is ended on the server in the background
              void logout().catch(() => undefined);
              router.replace("/login");
            }}
          >
            <LogOut size={14} strokeWidth={1.75} aria-hidden />
            Log out
          </button>
        </div>
      </aside>

      <div className="ml-[var(--sidebar-width)] min-h-screen">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-end gap-3 border-b border-[var(--line)] bg-white/95 px-8 backdrop-blur">
          <AttentionBell />
        </header>

        <main className="mx-auto max-w-[1450px] px-[34px] py-8">
          {subItems.length > 1 ? <SubNav items={subItems} /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
