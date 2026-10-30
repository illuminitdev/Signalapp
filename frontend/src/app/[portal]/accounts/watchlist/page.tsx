"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccountTable } from "@/components/accounts/AccountTable";
import { ImportCsvDialog } from "@/components/accounts/ImportCsvDialog";
import { MergeCandidates } from "@/components/accounts/MergeCandidates";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  downloadFile,
  listAccounts,
  listMergeCandidates,
  type Account,
  type MergeCandidate,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/Button";
import { Field, FormError, inputClass } from "@/components/ui/Field";

function Watchlist({ workspaceId }: { workspaceId: string }) {
  const { can, role } = useWorkspace();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [merges, setMerges] = useState<MergeCandidate[]>([]);
  const [researchState, setResearchState] = usePersistentState(`${workspaceId}:accounts:research`, "");
  const [acceptanceState, setAcceptanceState] = usePersistentState(`${workspaceId}:accounts:acceptance`, "");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([
        listAccounts(workspaceId, { researchState, acceptanceState }),
        can("import") ? listMergeCandidates(workspaceId) : Promise.resolve({ candidates: [] }),
      ]);
      setAccounts(a.accounts);
      setMerges(m.candidates);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounts");
    }
  }, [workspaceId, researchState, acceptanceState, can]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounts"
        title={role === "sdr" ? "My accounts" : "Watchlist & imports"}
        description={
          role === "sdr"
            ? "Accounts you own or have tasks on."
            : "Imported and discovered accounts stay unresearched until a research run completes."
        }
        actions={
          can("export") ? (
            <Button
              onClick={() =>
                void downloadFile(`/v1/workspaces/${workspaceId}/accounts/export`, "accounts.csv").catch((e) =>
                  setError(e instanceof Error ? e.message : "Export failed"),
                )
              }
            >
              Export CSV
            </Button>
          ) : null
        }
      />
      {can("import") ? <ImportCsvDialog workspaceId={workspaceId} onDone={refresh} /> : null}
      {can("import") ? <MergeCandidates workspaceId={workspaceId} candidates={merges} onResolved={refresh} /> : null}

      <div className="grid max-w-xl gap-3 sm:grid-cols-2" role="group" aria-label="Account filters">
        <Field label="Research">
          <select className={inputClass} value={researchState} onChange={(e) => setResearchState(e.target.value)}>
            <option value="">Any</option>
            <option value="unresearched">Unresearched</option>
            <option value="researching">Researching</option>
            <option value="researched">Researched</option>
            <option value="failed">Failed</option>
          </select>
        </Field>
        <Field label="Acceptance">
          <select className={inputClass} value={acceptanceState} onChange={(e) => setAcceptanceState(e.target.value)}>
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="ready_for_review">Ready for review</option>
            <option value="accepted">Accepted</option>
            <option value="needs_research">Needs research</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
      </div>

      <FormError message={error} />
      {accounts === null && !error ? <LoadingState label="Loading accounts…" /> : null}
      {accounts && accounts.length ? <AccountTable accounts={accounts} /> : null}
      {accounts && !accounts.length ? (
        <EmptyState
          title="No accounts"
          detail={researchState || acceptanceState ? "No accounts match these filters." : "Import a CSV or use Discover → Find & assign."}
        />
      ) : null}
      {error && !accounts ? <ErrorState message={error} /> : null}
    </div>
  );
}

export default function WatchlistPage() {
  return <RequireCap cap="view_accounts">{(workspaceId) => <Watchlist workspaceId={workspaceId} />}</RequireCap>;
}

