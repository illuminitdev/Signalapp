"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useWorkspace } from "../../hooks/useWorkspace";
import {
  CRM_PROVIDER_LABELS,
  getCrmStatus,
  previewCrmSync,
  startCrmSync,
  type CrmAccountStatus,
  type CrmSyncPlan,
  type CrmSyncStatus,
} from "../../lib/api/crm";
import { formatMoney, OPPORTUNITY_STAGE_LABELS, type OpportunityStage } from "../../lib/api/opportunities";
import { formatDate } from "../../lib/utils/dates";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FormError } from "../ui/Field";

const STATUS: Record<CrmSyncStatus, { label: string; tone: "default" | "green" | "amber" | "blue" | "red" }> = {
  recorded: { label: "Recorded", tone: "default" },
  queued: { label: "Queued", tone: "blue" },
  synced: { label: "Synced", tone: "green" },
  failed: { label: "Failed", tone: "red" },
};

const ACTION_LABELS = { create: "Create new", update: "Update", link: "Link to existing", skip: "Skip" } as const;

/**
 * Send an accepted account to the CRM (spec R8): preview first, then a queued sync with
 * Recorded / Queued / Synced / Failed shown separately and links into the CRM.
 */
export function CrmSyncPanel({
  accountId,
  workspaceId,
  acceptanceState,
}: {
  accountId: string;
  workspaceId: string;
  acceptanceState: string;
}) {
  const { can } = useWorkspace();
  const canSync = can("manage_integrations");
  const [status, setStatus] = useState<CrmAccountStatus | null>(null);
  const [plan, setPlan] = useState<CrmSyncPlan | null>(null);
  const [busy, setBusy] = useState<"preview" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getCrmStatus(accountId, workspaceId);
      setStatus(s);
      // Keep checking while the background job runs
      if (s.status === "queued") poll.current = setTimeout(() => void load(), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load CRM status");
    }
  }, [accountId, workspaceId]);

  useEffect(() => {
    void load();
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [load]);

  if (!status) return null;
  const crmName = CRM_PROVIDER_LABELS[status.provider] ?? status.provider;
  const accepted = acceptanceState === "accepted";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[16px]">
            CRM · {crmName}
            {status.status ? <Badge tone={STATUS[status.status].tone}>{STATUS[status.status].label}</Badge> : <Badge>Not sent yet</Badge>}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {status.syncedAt
              ? `Last synced ${formatDate(status.syncedAt)} · ${status.contactsSynced} of ${status.contactsTotal} contact${status.contactsTotal === 1 ? "" : "s"} sent`
              : "Sends the company, its sourced contacts and the deal to the CRM. Nothing is sent until you confirm."}
          </p>
        </div>
        {canSync && status.configured ? (
          <Button
            disabled={busy !== null || status.status === "queued" || !accepted}
            title={accepted ? undefined : "Only sales-accepted accounts can be sent to the CRM"}
            onClick={async () => {
              setBusy("preview");
              setError(null);
              try {
                setPlan(await previewCrmSync(accountId, workspaceId));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not preview the sync");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "preview" ? "Checking…" : status.status ? "Sync again" : `Send to ${crmName}`}
          </Button>
        ) : null}
      </div>

      {!status.configured ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No CRM is connected yet. An admin can connect one under Settings → Connections.</p>
      ) : !accepted && !status.status ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Accounts can be sent to the CRM once they are sales-accepted.</p>
      ) : null}

      {status.status === "failed" && status.lastError ? (
        <p className="mt-3 rounded-[7px] bg-[var(--red-tint)] px-3 py-2 text-sm text-[var(--red-active)]">{status.lastError}</p>
      ) : status.lastError ? (
        <p className="mt-3 rounded-[7px] bg-[var(--badge-amber-bg)] px-3 py-2 text-sm text-[var(--badge-amber-fg)]">{status.lastError}</p>
      ) : null}

      {status.companyUrl || status.dealUrl ? (
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {status.companyUrl ? (
            <a href={status.companyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--red-active)] hover:underline">
              Open company in {crmName} <ExternalLink size={13} aria-hidden />
            </a>
          ) : null}
          {status.dealUrl ? (
            <a href={status.dealUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--red-active)] hover:underline">
              Open deal in {crmName} <ExternalLink size={13} aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}

      {plan ? (
        <div className="mt-4 space-y-3 rounded-[10px] border border-[var(--line)] p-4 text-sm">
          <h3 className="text-[14px]">Preview: what will happen in {crmName}</h3>
          {plan.blockers.length ? (
            <ul className="list-disc space-y-1 pl-5 text-[var(--red-active)]">
              {plan.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          <table className="w-full text-left">
            <tbody className="divide-y divide-[var(--line)]">
              <tr>
                <td className="py-1.5 pr-3 text-[var(--muted)]">Company</td>
                <td className="py-1.5 pr-3">{plan.company.name}{plan.company.domain ? ` (${plan.company.domain})` : ""}</td>
                <td className="py-1.5 text-right font-medium">{ACTION_LABELS[plan.company.action]}</td>
              </tr>
              {plan.contacts.map((c) => (
                <tr key={c.contactId}>
                  <td className="py-1.5 pr-3 text-[var(--muted)]">Contact</td>
                  <td className="py-1.5 pr-3">{c.name}{c.reason ? <span className="text-[var(--muted)]"> · {c.reason}</span> : null}</td>
                  <td className={`py-1.5 text-right font-medium ${c.action === "skip" ? "text-[var(--muted)]" : ""}`}>{ACTION_LABELS[c.action]}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 pr-3 text-[var(--muted)]">Deal</td>
                <td className="py-1.5 pr-3">
                  {plan.deal.stage
                    ? `${OPPORTUNITY_STAGE_LABELS[plan.deal.stage as OpportunityStage] ?? plan.deal.stage} · ${formatMoney(plan.deal.amount, plan.deal.currency ?? "GBP")}`
                    : plan.deal.reason}
                </td>
                <td className={`py-1.5 text-right font-medium ${plan.deal.action === "skip" ? "text-[var(--muted)]" : ""}`}>{ACTION_LABELS[plan.deal.action]}</td>
              </tr>
            </tbody>
          </table>
          {plan.warnings.length ? (
            <ul className="space-y-1 text-xs text-[var(--muted)]">
              {plan.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={!plan.eligible || busy !== null}
              onClick={async () => {
                setBusy("sync");
                setError(null);
                try {
                  setStatus(await startCrmSync(accountId, workspaceId));
                  setPlan(null);
                  poll.current = setTimeout(() => void load(), 2000);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not start the sync");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "sync" ? "Queuing…" : `Confirm and send to ${crmName}`}
            </Button>
            <Button variant="ghost" onClick={() => setPlan(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-2">
        <FormError message={error} />
      </div>
    </Card>
  );
}
