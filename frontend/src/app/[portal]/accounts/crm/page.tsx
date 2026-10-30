"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightLeft, CircleCheck, CircleX, ExternalLink, Loader2 } from "lucide-react";
import { RequireCap } from "@/components/common/RequireCap";
import { OpportunityPanel } from "@/components/accounts/OpportunityPanel";
import { PeoplePanel } from "@/components/accounts/PeoplePanel";
import { GuidedCard } from "@/components/guide/GuidedCard";
import { GuideHeader } from "@/components/guide/GuideHeader";
import { PickList } from "@/components/guide/PickList";
import { Stepper, type GuideStep } from "@/components/guide/Stepper";
import { TourHint } from "@/components/guide/TourHint";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/Field";
import { useGuidedFlow } from "@/hooks/useGuidedFlow";
import { usePersistentState } from "@/hooks/usePersistentState";
import { getBrief, getPipeline, type Brief, type PipelineRow } from "@/lib/api/accounts";
import {
  CRM_PROVIDER_LABELS,
  getCrmStatus,
  previewCrmSync,
  startCrmSync,
  type CrmAccountStatus,
  type CrmSyncPlan,
} from "@/lib/api/crm";
import { formatMoney, OPPORTUNITY_STAGE_LABELS, type OpportunityStage } from "@/lib/api/opportunities";
import { formatDate } from "@/lib/utils/dates";

const STEPS: GuideStep[] = [
  { key: "why", label: "Why & which account" },
  { key: "contacts", label: "Contacts" },
  { key: "deal", label: "Deal" },
  { key: "preview", label: "Preview" },
  { key: "send", label: "Send & result" },
];

const ACTION_LABELS = { create: "Create new", update: "Update", link: "Link to existing", skip: "Skip" } as const;

function CrmGuide({ workspaceId }: { workspaceId: string }) {
  const [accountId, setAccountId] = usePersistentState<string | null>(`${workspaceId}:crm:account`, null);
  const [rows, setRows] = useState<PipelineRow[] | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [status, setStatus] = useState<CrmAccountStatus | null>(null);
  const [plan, setPlan] = useState<CrmSyncPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getPipeline(workspaceId).then((r) => setRows(r.rows)).catch(() => setRows([]));
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [workspaceId]);

  const loadStatus = useCallback(async () => {
    if (!accountId) return;
    try {
      const s = await getCrmStatus(accountId, workspaceId);
      setStatus(s);
      if (s.status === "queued") poll.current = setTimeout(() => void loadStatus(), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load CRM status");
    }
  }, [accountId, workspaceId]);

  useEffect(() => {
    setPlan(null);
    if (!accountId) {
      setBrief(null);
      setStatus(null);
      return;
    }
    void getBrief(accountId, workspaceId).then(setBrief).catch(() => setBrief(null));
    void loadStatus();
  }, [accountId, workspaceId, loadStatus]);

  const accepted = (rows ?? []).filter((r) => r.acceptanceState === "accepted");
  const crmName = CRM_PROVIDER_LABELS[status?.provider ?? "hubspot"] ?? "the CRM";
  const sent = status?.status === "queued" || status?.status === "synced" || status?.status === "failed";
  const reachable = brief && status ? (plan ? 4 : 3) : 0;
  const flow = useGuidedFlow(`${workspaceId}:crm`, STEPS.length, sent ? 4 : reachable);
  const name = brief?.account.name ?? "this account";
  const total = STEPS.length;

  async function runPreview() {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      setPlan(await previewCrmSync(accountId, workspaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await startCrmSync(accountId, workspaceId));
      flow.goTo(4);
      poll.current = setTimeout(() => void loadStatus(), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the sync");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <GuideHeader
        eyebrow="Guided · Send to CRM"
        title="Hand an accepted account to your sales team's CRM, safely and without duplicates."
        fullPage={accountId ? { href: `/accounts/detail?id=${accountId}`, label: "Open the full account page" } : undefined}
      />
      <Stepper steps={STEPS} current={flow.current} reachable={sent ? 4 : reachable} onSelect={flow.goTo} />

      {flow.current === 0 ? (
        <GuidedCard
          index={0}
          total={total}
          eyebrow="Why & which account"
          title={`Why send accounts to ${crmName}?`}
          why={
            <>
              SignalApp <strong>finds and qualifies</strong> leads. A CRM like {crmName} is where your sales team{" "}
              <strong>manages the deals</strong> day to day. Sending an accepted account creates its company, contacts and deal
              there, so nobody retypes anything. SignalApp remembers each record, so sending again updates it instead of making a
              copy, and opted-out people are never sent.
            </>
          }
          onNext={flow.next}
          nextDisabledReason={!brief ? "Pick an accepted account" : status && !status.configured ? "No CRM is connected" : null}
        >
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              ["1. Researcher qualifies", "Brief, evidence, contacts"],
              ["2. Reviewer accepts", "Owner + next action"],
              [`3. Sent to ${crmName}`, "Company, contacts, deal"],
            ].map(([t, s]) => (
              <div key={t} className="rounded-[10px] bg-[var(--chip-bg)] px-4 py-3">
                <p className="text-sm font-semibold">{t}</p>
                <p className="text-xs text-[var(--muted)]">{s}</p>
              </div>
            ))}
          </div>
          <TourHint id="crm.pick">Only sales-accepted accounts can be sent. Pick one below.</TourHint>
          {rows === null ? (
            <p className="text-sm text-[var(--muted)]">Loading accepted accounts…</p>
          ) : (
            <PickList
              label="accepted accounts"
              items={accepted.map((r) => ({
                id: r.accountId,
                title: r.name,
                subtitle: r.owner ? `Owner: ${r.owner.name}` : "No owner",
                meta: r.opportunity ? `${OPPORTUNITY_STAGE_LABELS[r.opportunity.stage]} · ${formatMoney(r.opportunity.valueAmount, r.opportunity.currency)}` : "No deal yet",
              }))}
              selectedId={accountId}
              onSelect={setAccountId}
              empty="No accepted accounts yet. A sales reviewer accepts briefs in Accounts → Review a brief."
            />
          )}
          {status && !status.configured ? (
            <p className="mt-4 text-sm text-[var(--red-active)]">No CRM is connected. A tenant admin can connect one in Settings → Connections &amp; usage.</p>
          ) : null}
        </GuidedCard>
      ) : null}

      {flow.current === 1 && brief ? (
        <GuidedCard
          index={1}
          total={total}
          eyebrow={name}
          title="Check the contacts"
          why={`Sourced contacts go to ${crmName} and are linked to the company. Anyone on the suppression list is skipped automatically.`}
          onBack={flow.back}
          onNext={flow.next}
        >
          <TourHint id="crm.contacts">Contacts with an email can be matched to people already in the CRM. No contacts? You can still send the company and deal.</TourHint>
          <PeoplePanel accountId={brief.account.id} workspaceId={workspaceId} evidence={brief.evidence} />
        </GuidedCard>
      ) : null}

      {flow.current === 2 && brief ? (
        <GuidedCard
          index={2}
          total={total}
          eyebrow={name}
          title="Check the deal"
          why={`The deal's stage, value and currency go to ${crmName}. After the first send, ${crmName} owns the stage and value, so later changes are made there.`}
          onBack={flow.back}
          onNext={flow.next}
        >
          <TourHint id="crm.deal">
            The CRM must accept the deal&apos;s currency. If it only accepts USD, record the deal in USD or add your currency in the CRM settings.
          </TourHint>
          <OpportunityPanel accountId={brief.account.id} workspaceId={workspaceId} />
        </GuidedCard>
      ) : null}

      {flow.current === 3 && brief ? (
        <GuidedCard
          index={3}
          total={total}
          eyebrow={name}
          title="Preview: what will happen"
          why={`Nothing is sent yet. This checks ${crmName} and shows what will be created, linked to an existing record, updated or skipped.`}
          onBack={flow.back}
          onNext={() => void send()}
          nextLabel={`Confirm and send to ${crmName}`}
          nextDisabledReason={!plan ? "Run the preview first" : !plan.eligible ? "Fix the problems above first" : null}
          busy={busy}
        >
          <TourHint id="crm.preview">“Link to existing” means the company is already in the CRM, so it won&apos;t be duplicated.</TourHint>
          <Button disabled={busy} onClick={() => void runPreview()}>
            <span className="inline-flex items-center gap-1.5">
              <ArrowRightLeft size={15} aria-hidden /> {plan ? "Check again" : `Check with ${crmName}`}
            </span>
          </Button>
          {plan ? (
            <div className="mt-5 space-y-4 text-sm">
              {plan.blockers.length ? (
                <ul className="space-y-1.5 rounded-[10px] bg-[var(--red-tint)] px-4 py-3 text-[var(--red-active)]">
                  {plan.blockers.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <CircleX size={16} className="mt-0.5 shrink-0" aria-hidden /> {b}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 font-medium text-[var(--badge-green-fg)]">
                  <CircleCheck size={16} aria-hidden /> Ready to send.
                </p>
              )}
              <table className="w-full text-left">
                <tbody className="divide-y divide-[var(--line)]">
                  <tr>
                    <td className="py-2 pr-3 text-[var(--muted)]">Company</td>
                    <td className="py-2 pr-3">{plan.company.name}{plan.company.domain ? ` (${plan.company.domain})` : ""}</td>
                    <td className="py-2 text-right font-semibold">{ACTION_LABELS[plan.company.action]}</td>
                  </tr>
                  {plan.contacts.map((c) => (
                    <tr key={c.contactId}>
                      <td className="py-2 pr-3 text-[var(--muted)]">Contact</td>
                      <td className="py-2 pr-3">{c.name}{c.reason ? <span className="text-[var(--muted)]"> · {c.reason}</span> : null}</td>
                      <td className={`py-2 text-right font-semibold ${c.action === "skip" ? "text-[var(--muted)]" : ""}`}>{ACTION_LABELS[c.action]}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pr-3 text-[var(--muted)]">Deal</td>
                    <td className="py-2 pr-3">
                      {plan.deal.stage
                        ? `${OPPORTUNITY_STAGE_LABELS[plan.deal.stage as OpportunityStage] ?? plan.deal.stage} · ${formatMoney(plan.deal.amount, plan.deal.currency ?? "GBP")}`
                        : plan.deal.reason}
                    </td>
                    <td className={`py-2 text-right font-semibold ${plan.deal.action === "skip" ? "text-[var(--muted)]" : ""}`}>{ACTION_LABELS[plan.deal.action]}</td>
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
            </div>
          ) : null}
          <div className="mt-3">
            <FormError message={error} />
          </div>
        </GuidedCard>
      ) : null}

      {flow.current === 4 && brief && status ? (
        <GuidedCard
          index={4}
          total={total}
          eyebrow={name}
          title={
            status.status === "synced" ? `Sent to ${crmName}` : status.status === "failed" ? "The send failed" : `Sending to ${crmName}…`
          }
          why={
            status.status === "synced"
              ? `The company${status.contactsSynced ? `, ${status.contactsSynced} contact${status.contactsSynced === 1 ? "" : "s"}` : ""} and the deal are in ${crmName}.`
              : status.status === "failed"
                ? "Nothing was duplicated. Fix the reason below, then preview and send again."
                : "This runs in the background and usually takes a few seconds."
          }
          onBack={status.status === "queued" ? undefined : () => flow.goTo(3)}
        >
          {status.status === "queued" ? (
            <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Queued…
            </p>
          ) : null}
          {status.lastError ? (
            <p
              className={`rounded-[8px] px-3 py-2 text-sm ${
                status.status === "failed" ? "bg-[var(--red-tint)] text-[var(--red-active)]" : "bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]"
              }`}
            >
              {status.lastError}
            </p>
          ) : null}
          {status.syncedAt ? <p className="mt-3 text-sm text-[var(--muted)]">Last synced {formatDate(status.syncedAt)}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            {status.companyUrl ? (
              <a href={status.companyUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="primary">
                  <span className="inline-flex items-center gap-1.5">
                    Open company in {crmName} <ExternalLink size={14} aria-hidden />
                  </span>
                </Button>
              </a>
            ) : null}
            {status.dealUrl ? (
              <a href={status.dealUrl} target="_blank" rel="noopener noreferrer">
                <Button>
                  <span className="inline-flex items-center gap-1.5">
                    Open deal in {crmName} <ExternalLink size={14} aria-hidden />
                  </span>
                </Button>
              </a>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                setAccountId(null);
                setPlan(null);
                flow.goTo(0);
              }}
            >
              Send another account
            </Button>
          </div>
        </GuidedCard>
      ) : null}
    </div>
  );
}

export default function CrmGuidePage() {
  return <RequireCap cap="manage_integrations">{(workspaceId) => <CrmGuide workspaceId={workspaceId} />}</RequireCap>;
}
