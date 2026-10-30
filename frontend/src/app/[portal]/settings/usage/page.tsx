"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getConnections, patchEntitlements, type Connections } from "@/lib/api/settings";
import { formatDate } from "@/lib/utils/dates";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FormError } from "@/components/ui/Field";

function UsageView({ workspaceId }: { workspaceId: string }) {
  const { can } = useWorkspace();
  const [data, setData] = useState<Connections | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConnections(workspaceId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [workspaceId]);

  if (!data) return error ? <ErrorState message={error} /> : <LoadingState />;
  const pct = data.usage.quotaMonthly ? Math.round((data.usage.usedMonthly / data.usage.quotaMonthly) * 100) : 0;
  const researchOn = data.entitlements.researchEnabled && !data.entitlements.researchKillSwitch;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Usage"
        description="Web research status, this month's usage against your company's research cap, and the research kill switch. Connect your CRM under Settings → Connect to CRM."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[16px]">Web research (Exa)</h2>
            <Badge tone={data.research.configured ? (researchOn ? "green" : "amber") : "red"}>
              {!data.research.configured ? "Not configured" : researchOn ? "Active" : "Paused"}
            </Badge>
          </div>
          <p className="mt-3 text-[28px] font-semibold tracking-tight">
            {data.usage.usedMonthly} / {data.usage.quotaMonthly}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded bg-[var(--chip-bg)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly research usage">
            <div className={`h-full ${pct >= 90 ? "bg-[var(--red)]" : "bg-[var(--navy)]"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Research units this month (since {formatDate(data.usage.periodStart)}). Runs are refused once the cap is reached.
          </p>
          {!data.research.configured ? (
            <p className="mt-2 text-sm text-[var(--red-active)]">Set EXA_API_KEY on the server to enable research.</p>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-[16px]">Research kill switch</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Immediately stops new research and discovery runs for this workspace.</p>
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              disabled={!can("manage_entitlements")}
              checked={data.entitlements.researchKillSwitch}
              onChange={async (e) => {
                try {
                  const res = await patchEntitlements(workspaceId, { researchKillSwitch: e.target.checked });
                  setData({ ...data, entitlements: res.entitlements });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not update");
                }
              }}
            />
            Pause all research
          </label>
          <FormError message={error} />
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[16px]">Sending</h2>
            <Badge>Disabled</Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">{data.sending.note}. Export approved drafts and send them yourself.</p>
        </Card>
      </div>
    </div>
  );
}

export default function UsagePage() {
  return (
    <RequireCap anyOf={["manage_settings", "research"]}>
      {(workspaceId) => <UsageView workspaceId={workspaceId} />}
    </RequireCap>
  );
}
