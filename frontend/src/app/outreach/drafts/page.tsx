"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DraftEditor } from "@/components/drafts/DraftEditor";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { listDrafts, type Draft } from "@/lib/api/drafts";
import { usePagination } from "@/components/ui/Pagination";

function DraftsView({ workspaceId }: { workspaceId: string }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { pageItems, pager, topRef } = usePagination(drafts ?? []);

  const refresh = useCallback(async () => {
    try {
      setDrafts((await listDrafts(workspaceId)).drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load drafts");
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Outreach"
        title="Drafts"
        description="Drafts are built from your offer and reviewed, cited evidence. Hypotheses are marked separately and no contact details are invented. Creating or editing a draft never sends anything."
      />
      {error ? <ErrorState message={error} /> : null}
      {drafts === null && !error ? <LoadingState label="Loading drafts…" /> : null}
      {drafts && !drafts.length ? (
        <EmptyState title="No drafts yet" detail="Open an account and choose “Draft outreach”." />
      ) : null}
      <div ref={topRef} className="scroll-mt-24 space-y-6">
        {pageItems.map((d) => <DraftEditor key={d.id} draft={d} workspaceId={workspaceId} onSaved={refresh} />)}
      </div>
      {pager}
    </div>
  );
}

export default function DraftsPage() {
  return <RequireCap cap="view_drafts">{(workspaceId) => <DraftsView workspaceId={workspaceId} />}</RequireCap>;
}
