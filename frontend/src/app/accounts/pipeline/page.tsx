"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccountTable } from "@/components/accounts/AccountTable";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { listAccounts, type Account } from "@/lib/api/accounts";

function Pipeline({ workspaceId }: { workspaceId: string }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccounts(workspaceId, { acceptanceState: "accepted" })
      .then((r) => setAccounts(r.accounts))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [workspaceId]);

  if (error) return <ErrorState message={error} />;
  if (!accounts) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        title="Accepted accounts"
        description="Accounts sales has accepted. Acceptance is tracked separately from opportunity stage and from tasks."
      />
      {accounts.length ? <AccountTable accounts={accounts} /> : <EmptyState title="No accepted accounts yet" />}
    </div>
  );
}

export default function PipelinePage() {
  return <RequireCap cap="view_accounts">{(workspaceId) => <Pipeline workspaceId={workspaceId} />}</RequireCap>;
}
