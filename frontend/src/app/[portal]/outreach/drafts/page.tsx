"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, FilePen, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DraftEditor } from "@/components/drafts/DraftEditor";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { listDrafts, type Draft } from "@/lib/api/drafts";
import { usePagination } from "@/components/ui/Pagination";

type Tab = "pending" | "approved";

function DraftsView({ workspaceId }: { workspaceId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params.get("tab") === "approved" ? "approved" : "pending";
  const accountFilter = params.get("account");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const forAccount = (drafts ?? []).filter((d) => !accountFilter || d.accountId === accountFilter);
  const pending = forAccount.filter((d) => !d.approvedAt);
  const approved = forAccount.filter((d) => d.approvedAt);
  const shown = tab === "approved" ? approved : pending;
  const { pageItems, pager, topRef } = usePagination(shown);
  const accountName = accountFilter ? (drafts ?? []).find((d) => d.accountId === accountFilter)?.accountName : null;

  // Tabs and the account filter live in the address, so links can open a tab for one account
  const go = (next: { tab?: Tab; account?: string | null }) => {
    const q = new URLSearchParams();
    const t = next.tab ?? tab;
    const a = next.account === undefined ? accountFilter : next.account;
    if (t === "approved") q.set("tab", "approved");
    if (a) q.set("account", a);
    router.replace(`?${q.toString()}`, { scroll: false });
  };

  const tabs: Array<{ key: Tab; label: string; count: number; Icon: typeof FilePen; hint: string }> = [
    { key: "pending", label: "To review", count: pending.length, Icon: FilePen, hint: "Edit and check these, then approve them." },
    { key: "approved", label: "Approved", count: approved.length, Icon: CircleCheck, hint: "Checked and approved, ready to use. Still nothing is sent from here." },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Outreach"
        title="Drafts"
        description="Drafts are built from your offer and reviewed, cited evidence. Hypotheses are marked separately and no contact details are invented. Creating or editing a draft never sends anything."
      />

      <div role="tablist" aria-label="Draft status" className="grid gap-3 sm:grid-cols-2">
        {tabs.map(({ key, label, count, Icon, hint }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go({ tab: key })}
              className={`flex items-start gap-3 rounded-[12px] border px-5 py-4 text-left transition-colors ${
                active
                  ? "border-[var(--red)] bg-[var(--red-tint)]"
                  : "border-[var(--line)] bg-white hover:bg-[var(--chip-bg)]"
              }`}
            >
              <Icon size={20} className={active ? "mt-0.5 text-[var(--red-active)]" : "mt-0.5 text-[var(--muted)]"} aria-hidden />
              <span>
                <span className="flex items-center gap-2 text-[15px] font-semibold text-[var(--foreground)]">
                  {label}
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                    {drafts ? count : "…"}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {accountFilter ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-[var(--chip-bg)] px-3 py-1">
            Showing drafts for <strong>{accountName ?? "this account"}</strong>
          </span>
          <button
            type="button"
            onClick={() => go({ account: null })}
            className="inline-flex items-center gap-1 font-medium text-[var(--muted)] hover:text-[var(--red-active)]"
          >
            <X size={14} aria-hidden /> Show all accounts
          </button>
        </div>
      ) : null}

      {error ? <ErrorState message={error} /> : null}
      {drafts === null && !error ? <LoadingState label="Loading drafts…" /> : null}
      {drafts && !shown.length ? (
        tab === "approved" ? (
          <EmptyState title="No approved drafts yet" detail="Approve a draft in “To review” after checking it." />
        ) : (
          <EmptyState title="Nothing to review" detail="Open an account and choose “Draft outreach” to create one." />
        )
      ) : null}
      <div ref={topRef} className="scroll-mt-24 space-y-6" role="tabpanel">
        {pageItems.map((d) => <DraftEditor key={d.id} draft={d} workspaceId={workspaceId} onSaved={refresh} />)}
      </div>
      {pager}
    </div>
  );
}

export default function DraftsPage() {
  return <RequireCap cap="view_drafts">{(workspaceId) => <DraftsView workspaceId={workspaceId} />}</RequireCap>;
}
