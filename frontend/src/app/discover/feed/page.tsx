"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { OpportunityFeed } from "@/components/accounts/OpportunityFeed";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { listAccounts, type Account } from "@/lib/api/accounts";
import { getOffer, type Offer } from "@/lib/api/settings";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePersistentState } from "@/hooks/usePersistentState";
import { makeExclusionMatcher } from "@/lib/utils/exclusions";

const SCORE_OPTIONS = [null, 50, 70, 85] as const;
const OPEN_STATES = ["draft", "ready_for_review", "needs_research"];

function StatTile({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-white px-7 py-7">
      <p className="text-[15px] text-[var(--muted)]">{label}</p>
      <p className="mt-5 text-[34px] font-semibold leading-none text-[var(--foreground)]">{value}</p>
      <p className="mt-5 text-sm text-[var(--muted)]">{caption}</p>
    </div>
  );
}

function Feed({ workspaceId }: { workspaceId: string }) {
  const { can } = useWorkspace();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [minScore, setMinScore] = usePersistentState<number | null>(`${workspaceId}:feed:minScore`, null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccounts(workspaceId)
      .then((r) => setAccounts(r.accounts))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
    // Targeting saved by the admin under Settings → Offer
    getOffer(workspaceId)
      .then((r) => setOffer(r.offer))
      .catch(() => setOffer(null));
  }, [workspaceId]);

  // Accounts the admin excluded under Settings → Offer never show in the feed
  const visible = useMemo(() => {
    const isExcluded = makeExclusionMatcher(offer?.exclusions ?? []);
    return (accounts ?? []).filter((a) => !isExcluded(a));
  }, [accounts, offer]);

  const feed = useMemo(() => {
    let rows = visible.filter((a) => a.researchState === "researched");
    if (minScore != null) rows = rows.filter((a) => (a.fitScore ?? 0) >= minScore);
    return [...rows].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
  }, [visible, minScore]);

  if (error) return <ErrorState message={error} />;
  if (!accounts) return <LoadingState />;

  const toReview = feed.filter((a) => OPEN_STATES.includes(a.acceptanceState)).length;
  const qualified = visible.filter((a) => a.acceptanceState === "accepted").length;
  const evidenceGaps = visible.filter(
    (a) => a.researchState === "researched" && a.acceptanceState !== "rejected" && !a.hasDatedEvidence,
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="Opportunity feed"
        title="Reasons to start a conversation"
        description="Researched accounts ranked by fit, recency and evidence quality. Scores help you prioritise; they are not purchase probabilities."
        actions={
          <Link href="/discover/search">
            <Button variant="primary">Find prospects</Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-5 md:grid-cols-3">
        <StatTile label="Accounts to review" value={toReview} caption="Matching the current sample criteria" />
        <StatTile label="Qualified pipeline accounts" value={qualified} caption="From decisions in this workspace" />
        <StatTile label="Evidence gaps" value={evidenceGaps} caption="Requires a dated evidence source" />
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-[var(--line)] bg-white px-7 py-6">
        <div className="min-w-0">
          {offer?.offering ? (
            <>
              <h2 className="text-[17px]">{offer.offering}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Buyers: {offer.buyerRoles.length ? offer.buyerRoles.join(", ") : "not set"}
                {offer.territory.length ? ` · Territory: ${offer.territory.join(", ")}` : ""}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[17px]">No offer set yet</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {can("manage_settings") ? (
                  <>
                    Describe what you sell and who buys it in{" "}
                    <Link href="/settings/offer" className="font-semibold text-[var(--red-active)] hover:underline">
                      Settings → Offer
                    </Link>
                    .
                  </>
                ) : (
                  "Ask a workspace admin to describe what you sell and who buys it."
                )}
              </p>
            </>
          )}
        </div>
        <label className="block">
          <span className="block text-sm font-semibold text-[var(--foreground)]">Minimum score</span>
          <select
            className={`${inputClass} mt-1 min-w-[200px]`}
            value={minScore ?? ""}
            onChange={(e) => setMinScore(e.target.value ? Number(e.target.value) : null)}
          >
            {SCORE_OPTIONS.map((n) => (
              <option key={String(n)} value={n ?? ""}>
                {n == null ? "All scores" : `${n}+`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <OpportunityFeed accounts={feed} />
    </div>
  );
}

export default function FeedPage() {
  return <RequireCap cap="discover">{(workspaceId) => <Feed workspaceId={workspaceId} />}</RequireCap>;
}

