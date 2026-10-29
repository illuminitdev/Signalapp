"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccountTable } from "@/components/accounts/AccountTable";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { useWorkspace } from "@/hooks/useWorkspace";
import { listAccounts, type Account } from "@/lib/api/accounts";
import { KpiTile } from "@/components/ui/KpiTile";

function AcceptanceQueue({ workspaceId }: { workspaceId: string }) {
  const { can } = useWorkspace();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccounts(workspaceId)
      .then((r) => setAccounts(r.accounts))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [workspaceId]);

  if (error) return <ErrorState message={error} />;
  if (!accounts) return <LoadingState />;

  const count = (s: string) => accounts.filter((a) => a.acceptanceState === s).length;
  const queue = can("accept")
    ? accounts.filter((a) => a.acceptanceState === "ready_for_review")
    : accounts.filter((a) => a.acceptanceState === "draft" || a.acceptanceState === "needs_research");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales acceptance"
        title={can("accept") ? "Briefs waiting for review" : "Briefs to finish and submit"}
        description={
          can("accept")
            ? "Open an account to accept, return or reject it. Each decision records the reviewer, reason, time and brief version."
            : "Draft and returned accounts. Complete the qualification brief, then submit it for review."
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <KpiTile label="Draft" value={count("draft")} />
        <KpiTile label="Ready for review" value={count("ready_for_review")} />
        <KpiTile label="Needs research" value={count("needs_research")} />
        <KpiTile label="Accepted" value={count("accepted")} />
      </div>
      {queue.length ? <AccountTable accounts={queue} /> : <EmptyState title="Nothing in this queue" />}
    </div>
  );
}

export default function SalesAcceptancePage() {
  return (
    <RequireCap anyOf={["accept", "submit_review"]}>
      {(workspaceId) => <AcceptanceQueue workspaceId={workspaceId} />}
    </RequireCap>
  );
}

