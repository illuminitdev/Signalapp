import { Unplug } from "lucide-react";
import { CrmLogo } from "@/components/settings/CrmLogos";
import type { PlatformCompany } from "@/lib/api/platform";
import { formatDate } from "@/lib/utils/dates";

const CRM_NAMES: Record<string, string> = { hubspot: "HubSpot", salesforce: "Salesforce", other: "Other CRM" };

/** Which CRM a company connected, for the platform admin (provider and health only, never credentials). */
export function CrmChip({ crm }: { crm: PlatformCompany["crm"] }) {
  if (!crm) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--chip-bg)] px-2.5 py-0.5 text-xs text-[var(--muted)]">
        <Unplug size={12} aria-hidden /> No CRM
      </span>
    );
  }
  const ok = crm.status === "connected";
  const name = CRM_NAMES[crm.provider] ?? crm.provider;
  return (
    <span
      title={[crm.accountLabel, `Connected ${formatDate(crm.connectedAt)}`, crm.lastCheckedAt ? `Last checked ${formatDate(crm.lastCheckedAt)}` : null]
        .filter(Boolean)
        .join(" · ")}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ok ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]" : "bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]"
      }`}
    >
      <CrmLogo provider={crm.provider} size={12} tile={14} /> {name}
      {ok ? "" : " · check failed"}
    </span>
  );
}
