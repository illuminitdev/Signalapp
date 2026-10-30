"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getBrief, type Brief } from "../../lib/api/accounts";
import { formatDate } from "../../lib/utils/dates";
import { StatusBadge } from "../common/StatusBadge";
import { Button } from "../ui/Button";
import { OpportunityPanel } from "./OpportunityPanel";
import { humanize } from "../ui/Field";

/** Slide-over with one lead's key data; the full brief stays one click away */
export function LeadPanel({
  accountId,
  workspaceId,
  onClose,
  onOpportunitySaved,
}: {
  accountId: string;
  workspaceId: string;
  onClose: () => void;
  /** Lets the pipeline refresh its deal columns after an edit in the panel */
  onOpportunitySaved?: () => void;
}) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBrief(null);
    setError(null);
    getBrief(accountId, workspaceId)
      .then(setBrief)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load lead"));
  }, [accountId, workspaceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const account = brief?.account;
  const latestDecision = brief?.decisions[0];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={account?.name ?? "Lead details"}
        className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--red)]">Lead</p>
            <h2 className="mt-1 text-[20px] leading-snug">{account?.name ?? "Loading…"}</h2>
            {account ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {[account.domain, account.country, account.legalName].filter(Boolean).join(" · ") || "No domain"}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lead details"
            className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)]"
          >
            <X size={18} />
          </button>
        </div>

        {error ? <p className="px-6 py-5 text-sm text-[var(--red-active)]">{error}</p> : null}
        {!brief && !error ? <p className="px-6 py-5 text-sm text-[var(--muted)]">Loading lead…</p> : null}

        {brief && account ? (
          <div className="flex-1 space-y-6 px-6 py-5 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Item label="Sales acceptance">
                <StatusBadge status={account.acceptanceState} />
              </Item>
              <Item label="Research">
                <StatusBadge status={account.researchState} />
              </Item>
              <Item label="Owner">{brief.owner?.name ?? "Unassigned"}</Item>
              <Item label="Priority">{account.fitScore != null ? `${account.fitScore} / 100` : "Not scored"}</Item>
              <Item label="Added via">{humanize(account.source)}</Item>
              <Item label="Last updated">{formatDate(account.updatedAt)}</Item>
            </dl>

            <OpportunityPanel accountId={accountId} workspaceId={workspaceId} compact onSaved={onOpportunitySaved} />

            <section>
              <h3 className="mb-2 text-[14px]">Signals</h3>
              {brief.signals.length ? (
                <ul className="space-y-2">
                  {brief.signals.map((s) => (
                    <li key={s.id} className="rounded-[7px] bg-[var(--chip-bg)] px-3 py-2">
                      <span className="font-semibold">{humanize(s.kind)}</span>
                      {s.observedFact ? <p className="mt-0.5 text-[var(--muted)]">{s.observedFact}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--muted)]">No signals yet. Run research from the full account page.</p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-[14px]">
                Evidence <span className="font-normal text-[var(--muted)]">({brief.evidence.length})</span>
              </h3>
              {brief.evidence.length ? (
                <ul className="space-y-3">
                  {brief.evidence.slice(0, 3).map((e) => (
                    <li key={e.id} className="border-l-2 border-[var(--line)] pl-3">
                      <a
                        href={e.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[var(--foreground)] hover:text-[var(--red-active)]"
                      >
                        {e.sourceTitle ?? e.publisher ?? e.sourceUrl}
                      </a>
                      <p className="text-xs text-[var(--muted)]">
                        {[e.publisher, e.eventDate ? formatDate(e.eventDate) : null, e.reviewedAt ? "Reviewed" : "Not reviewed"]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {e.excerpt ? <p className="mt-1 line-clamp-3 text-[var(--muted)]">{e.excerpt}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--muted)]">No evidence collected yet.</p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-[14px]">Latest decision</h3>
              {latestDecision ? (
                <div className="space-y-1">
                  <p>
                    {humanize(latestDecision.fromState)} → <span className="font-semibold">{humanize(latestDecision.toState)}</span>
                    <span className="text-[var(--muted)]">
                      {" "}
                      by {latestDecision.actorName} · {formatDate(latestDecision.createdAt)}
                    </span>
                  </p>
                  {latestDecision.reasonDetail ? <p className="text-[var(--muted)]">{latestDecision.reasonDetail}</p> : null}
                  {latestDecision.nextAction ? <p>Next action: {latestDecision.nextAction}</p> : null}
                </div>
              ) : (
                <p className="text-[var(--muted)]">No decision recorded yet.</p>
              )}
            </section>
          </div>
        ) : null}

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--line)] bg-white px-6 py-4">
          <Button onClick={onClose}>Close</Button>
          <Link href={`/accounts/detail?id=${accountId}`}>
            <Button variant="primary">Open full account</Button>
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
