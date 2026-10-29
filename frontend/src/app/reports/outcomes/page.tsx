"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getOutcomes, type Outcomes } from "@/lib/api/settings";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { humanize } from "@/components/ui/Field";

// The pilot report covers every decision recorded, not a rolling window
const PILOT_START = new Date("2000-01-01T00:00:00Z").toISOString();

function StatTile({ label, value, caption }: { label: string; value: string | number; caption: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-white px-5 py-6">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-4 text-[28px] font-semibold leading-none text-[var(--foreground)]">{value}</p>
      <p className="mt-4 text-xs text-[var(--muted)]">{caption}</p>
    </div>
  );
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function OutcomesView({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<Outcomes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOutcomes(workspaceId, PILOT_START, new Date().toISOString())
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load outcomes"));
  }, [workspaceId]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const m = data.metrics;
  const decided = data.denominators.accountsWithReviewerDecision;
  const rate = m.acceptanceRate == null ? 0 : Math.round(m.acceptanceRate * 100);
  const reasons = Object.entries(data.breakdowns.rejectionReasons ?? {}).sort((a, b) => b[1] - a[1]);
  const totalRejected = reasons.reduce((n, [, v]) => n + v, 0);

  return (
    <div className="max-w-[1040px] space-y-6">
      <Card>
        <h2 className="text-[16px]">Customer team activity</h2>
        <p className="mt-3 text-sm text-[var(--foreground)]">
          Lenovo SDRs and TBT execute outreach. Signal is the research and workflow platform.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <StatTile label="Sales-accepted briefs" value={m.explicitSalesAccepted} caption="Explicit acceptance decisions" />
          <StatTile label="Open SDR tasks" value={m.openSdrTasks} caption="Assigned in this workspace" />
          <StatTile label="Completed SDR tasks" value={m.completedSdrActions} caption="User-recorded outcomes" />
        </div>
      </Card>

      <div>
        <Eyebrow>Learn from decisions</Eyebrow>
        <h1 className="text-[var(--foreground)]">Pilot outcomes</h1>
        <p className="mt-2 text-xs text-[var(--muted)]">Metrics reflect decisions entered in this browser, not synced CRM activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Qualified pipeline accounts"
          value={m.explicitSalesAccepted}
          caption={`${rate}% of ${decided} decisioned account${decided === 1 ? "" : "s"}`}
        />
        <StatTile label="Meeting or won stage" value={m.meetings ?? 0} caption="Current stages, not historical meeting counts" />
        <StatTile
          label="Open opportunity value"
          // No opportunity values are recorded yet (CRM not connected)
          value={money(0, data.currency)}
          caption="User-entered values; not attributed revenue"
        />
      </div>

      <Card>
        <h2 className="text-[16px]">Rejection feedback</h2>
        {reasons.length ? (
          <ul className="mt-4 space-y-3">
            {reasons.map(([reason, count]) => (
              <li key={reason}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{humanize(reason)}</span>
                  <span className="text-[var(--muted)]">
                    {count} account{count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--chip-bg)]">
                  <div className="h-full rounded-full bg-[var(--red)]" style={{ width: `${(count / totalRejected) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Record rejection reasons in an account brief to learn why opportunities do not qualify.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-[16px]">Validate with real users</h2>
        <p className="mt-3 text-sm text-[var(--foreground)]">
          Track accepted accounts, evidence corrections and research time saved during the live pilot. Automated CRM
          attribution and ranking optimisation are not connected.
        </p>
        <Link href="/accounts/sales-acceptance" className="mt-4 inline-block">
          <Button>Review decisions</Button>
        </Link>
      </Card>
    </div>
  );
}

export default function OutcomesPage() {
  return <RequireCap cap="view_outcomes">{(workspaceId) => <OutcomesView workspaceId={workspaceId} />}</RequireCap>;
}
