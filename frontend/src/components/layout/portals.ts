import {
  BookOpenCheck,
  Boxes,
  Briefcase,
  ClipboardCheck,
  Compass,
  FileChartColumn,
  Inbox,
  LayoutDashboard,
  Send,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Capability } from "../../lib/auth/capabilities";

type Can = (cap: Capability) => boolean;

export type PortalKey = "admin" | "researcher" | "reviewer" | "sdr" | "analyst" | "partner";

export type PortalItem = { href: string; label: string; visible?: (can: Can) => boolean };

/** One left-menu entry. Hrefs are portal-relative ("/accounts/pipeline"); the portal prefix is added when shown. */
export type PortalSection = {
  key: string;
  label: string;
  Icon: LucideIcon;
  items: PortalItem[];
  /** Pages outside the sub-menu that still belong here, e.g. /accounts/detail under Accounts */
  owns?: string[];
};

export type Portal = {
  key: PortalKey;
  label: string;
  /** URL prefix: every page of this portal lives under it */
  prefix: string;
  sections: PortalSection[];
};

const settings = (extra: PortalItem[] = []): PortalSection => ({
  key: "settings",
  label: "Settings",
  Icon: Settings,
  items: [
    ...extra,
    { href: "/settings/password", label: "Password" },
    { href: "/settings/how-it-works", label: "How it works" },
  ],
});

/** Account pages opened from lists (not in the menu) */
const ACCOUNT_PAGES = ["/accounts/detail", "/accounts/qualification"];

const reports: PortalSection = {
  key: "reports",
  label: "Reports",
  Icon: FileChartColumn,
  items: [{ href: "/reports/outcomes", label: "Outcomes", visible: (can) => can("view_outcomes") }],
};

/**
 * Each role has its own portal: its own address, menu and pages. Portals never share a
 * screen; work moves between them only by hand-off (a task, a brief sent for review, a
 * shared handoff), and each portal shows what arrived from the others.
 */
export const PORTALS: Record<PortalKey, Portal> = {
  admin: {
    key: "admin",
    label: "Tenant admin",
    prefix: "/admin",
    sections: [
      { key: "overview", label: "Overview", Icon: LayoutDashboard, items: [{ href: "/overview", label: "Overview" }] },
      {
        key: "discover",
        label: "Discover",
        Icon: Compass,
        items: [
          { href: "/discover/assign", label: "Find & assign" },
          { href: "/discover/playbooks", label: "Playbooks" },
        ],
      },
      {
        key: "accounts",
        label: "Accounts",
        Icon: Briefcase,
        owns: ACCOUNT_PAGES,
        items: [
          { href: "/accounts/watchlist", label: "Watchlist & imports" },
          { href: "/accounts/pipeline", label: "Pipeline" },
          { href: "/accounts/monitors", label: "Monitors" },
          { href: "/accounts/qualify", label: "Qualify a lead" },
          { href: "/accounts/sales-acceptance", label: "Sales acceptance" },
          { href: "/accounts/review", label: "Review a brief" },
          { href: "/accounts/crm", label: "Send to CRM" },
        ],
      },
      {
        key: "outreach",
        label: "Outreach",
        Icon: Send,
        items: [
          { href: "/outreach/tasks", label: "Tasks" },
          { href: "/outreach/drafts", label: "Drafts" },
          { href: "/outreach/work", label: "Work my tasks" },
        ],
      },
      reports,
      { key: "members", label: "Members", Icon: Users, items: [{ href: "/members", label: "Members" }] },
      {
        key: "workspaces",
        label: "Workspaces",
        Icon: Boxes,
        items: [{ href: "/workspaces", label: "Workspaces" }],
      },
      settings([
        { href: "/settings/offer", label: "Offer & targeting" },
        { href: "/settings/suppressions", label: "Suppressions" },
        { href: "/settings/usage", label: "Usage" },
        { href: "/settings/crm", label: "Connect to CRM" },
      ]),
    ],
  },

  researcher: {
    key: "researcher",
    label: "Researcher",
    prefix: "/researcher",
    sections: [
      {
        key: "leads",
        label: "My leads",
        Icon: Inbox,
        items: [
          { href: "/accounts/qualify", label: "Qualify a lead" },
          { href: "/outreach/work", label: "Work my tasks" },
          { href: "/outreach/tasks", label: "Tasks" },
        ],
      },
      {
        key: "discover",
        label: "Find leads",
        Icon: Compass,
        items: [
          { href: "/discover/assign", label: "Find leads" },
          { href: "/discover/playbooks", label: "Playbooks" },
        ],
      },
      {
        key: "accounts",
        label: "Accounts",
        Icon: Briefcase,
        owns: ACCOUNT_PAGES,
        items: [
          { href: "/accounts/watchlist", label: "Watchlist & imports" },
          { href: "/accounts/pipeline", label: "Pipeline" },
          { href: "/accounts/monitors", label: "Monitors" },
        ],
      },
      { key: "outreach", label: "Outreach", Icon: Send, items: [{ href: "/outreach/drafts", label: "Drafts" }] },
      reports,
      settings([{ href: "/settings/usage", label: "Usage" }]),
    ],
  },

  reviewer: {
    key: "reviewer",
    label: "Sales reviewer",
    prefix: "/reviewer",
    sections: [
      {
        key: "review",
        label: "Review",
        Icon: ClipboardCheck,
        items: [
          { href: "/accounts/review", label: "Review a brief" },
          { href: "/accounts/sales-acceptance", label: "Sales acceptance" },
        ],
      },
      {
        key: "accounts",
        label: "Accounts",
        Icon: Briefcase,
        owns: ACCOUNT_PAGES,
        items: [
          { href: "/accounts/pipeline", label: "Pipeline" },
          { href: "/accounts/watchlist", label: "Watchlist" },
          { href: "/accounts/monitors", label: "Monitors" },
          { href: "/accounts/crm", label: "Send to CRM", visible: (can) => can("manage_integrations") },
        ],
      },
      {
        key: "outreach",
        label: "Outreach",
        Icon: Send,
        items: [
          { href: "/outreach/tasks", label: "Tasks" },
          { href: "/outreach/work", label: "Work my tasks" },
          { href: "/outreach/drafts", label: "Drafts" },
        ],
      },
      reports,
      settings([{ href: "/settings/crm", label: "Connect to CRM", visible: (can) => can("manage_integrations") }]),
    ],
  },

  sdr: {
    key: "sdr",
    label: "SDR",
    prefix: "/sdr",
    sections: [
      {
        key: "work",
        label: "My work",
        Icon: BookOpenCheck,
        items: [
          { href: "/outreach/work", label: "Work my tasks" },
          { href: "/outreach/tasks", label: "Tasks" },
        ],
      },
      {
        key: "accounts",
        label: "Accounts",
        Icon: Briefcase,
        owns: ACCOUNT_PAGES,
        items: [
          { href: "/accounts/pipeline", label: "Pipeline" },
          { href: "/accounts/watchlist", label: "My accounts" },
        ],
      },
      { key: "outreach", label: "Outreach", Icon: Send, items: [{ href: "/outreach/drafts", label: "Drafts" }] },
      reports,
      settings(),
    ],
  },

  analyst: {
    key: "analyst",
    label: "Analyst",
    prefix: "/analyst",
    sections: [reports, settings()],
  },

  partner: {
    key: "partner",
    label: "Partner",
    prefix: "/partner",
    sections: [
      {
        key: "shared",
        label: "Shared with me",
        Icon: Inbox,
        items: [{ href: "/shared", label: "Shared handoffs" }],
      },
      settings(),
    ],
  },
};

const ROLE_PORTAL: Record<string, PortalKey> = {
  tenant_admin: "admin",
  researcher: "researcher",
  sales_reviewer: "reviewer",
  sdr: "sdr",
  analyst: "analyst",
  partner: "partner",
};

export function portalForRole(role: string | null | undefined): Portal | null {
  const key = role ? ROLE_PORTAL[role] : undefined;
  return key ? PORTALS[key] : null;
}

/** "/researcher/accounts/qualify" → "/accounts/qualify" (any portal's prefix is removed). */
export function toPortalPath(pathname: string): string {
  for (const p of Object.values(PORTALS)) {
    if (pathname === p.prefix) return "/";
    if (pathname.startsWith(`${p.prefix}/`)) return pathname.slice(p.prefix.length);
  }
  return pathname;
}

const matches = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** Sections and sub-pages this member may use in their portal, in menu order. */
export function visibleSections(portal: Portal, can: Can): PortalSection[] {
  return portal.sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.visible || i.visible(can)) }))
    .filter((s) => s.items.length > 0);
}

/** The menu section a portal-relative path belongs to (its own sub-pages first, then pages it owns). */
export function sectionOf(sections: PortalSection[], path: string): PortalSection | undefined {
  return (
    sections.find((s) => s.items.some((i) => matches(path, i.href))) ??
    sections.find((s) => s.owns?.some((o) => matches(path, o)))
  );
}

export function portalHome(portal: Portal, can: Can): string {
  const first = visibleSections(portal, can)[0]?.items[0]?.href ?? "/settings/how-it-works";
  return portal.prefix + first;
}

/** First path segments of pages that live inside a portal ("/accounts/…", "/outreach/…"). */
const PORTAL_PAGES = /^\/(overview|discover|accounts|outreach|reports|members|workspaces|settings|shared)(\/|\?|$)/;

export function isPortalPage(path: string) {
  return PORTAL_PAGES.test(path);
}

/** Adds the member's portal prefix to a portal page path; leaves anything else alone. */
export function inPortal(prefix: string, path: string) {
  return isPortalPage(path) ? prefix + path : path;
}
