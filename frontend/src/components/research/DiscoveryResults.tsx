"use client";

import Link from "next/link";
import { usePagination } from "../ui/Pagination";
import { useState } from "react";
import type { DiscoveryRow } from "../../lib/api/research";
import { downloadFile } from "../../lib/api/accounts";
import { formatDate } from "../../lib/utils/dates";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { FormError } from "../ui/Field";
import { TableWrap } from "../ui/TableWrap";

/** Search results: one row per company with its latest trigger, evidence and priority. */
export function DiscoveryResults({
  rows,
  runId,
  workspaceId,
  canExport,
}: {
  rows: DiscoveryRow[];
  runId: string;
  workspaceId: string;
  canExport: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const { pageItems, pager } = usePagination(rows);

  return (
    <section aria-labelledby="results-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="results-heading" className="text-[17px]">
            {rows.length} {rows.length === 1 ? "company" : "companies"} found
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Real web sources, saved as evidence on each account. Review the evidence before qualifying.
          </p>
        </div>
        {canExport && rows.length ? (
          <Button
            onClick={() =>
              void downloadFile(`/v1/research-runs/${runId}/results.csv?workspaceId=${workspaceId}`, "search-results.csv").catch((e) =>
                setError(e instanceof Error ? e.message : "Export failed"),
              )
            }
          >
            Export results
          </Button>
        ) : null}
      </div>
      <FormError message={error} />

      <TableWrap>
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Companies found by this search</caption>
          <thead className="border-b border-[var(--line)] bg-[var(--table-head)] text-[12px] font-medium text-[var(--muted)]">
            <tr>
              <th scope="col" className="px-4 py-3">Account</th>
              <th scope="col" className="px-4 py-3">Trigger</th>
              <th scope="col" className="px-4 py-3">Evidence</th>
              <th scope="col" className="px-4 py-3">Priority</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r) => (
              <tr key={r.accountId} className="border-b border-[var(--line)] align-top last:border-0">
                <td className="px-4 py-3.5">
                  <p className="font-semibold text-[var(--foreground)]">
                    {r.name}
                    {r.isNew ? <span className="ml-2 align-middle"><Badge tone="blue">New</Badge></span> : null}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{[r.domain, r.country].filter(Boolean).join(" · ") || "Website unknown"}</p>
                </td>
                <td className="max-w-[420px] px-4 py-3.5">
                  <a href={r.trigger.url} target="_blank" rel="noreferrer noopener" className="text-[var(--foreground)] hover:text-[var(--red-active)] hover:underline">
                    {r.trigger.summary ?? r.trigger.title ?? r.trigger.url}
                  </a>
                  <p className="text-xs text-[var(--muted)]">{r.trigger.eventDate ? formatDate(r.trigger.eventDate) : "Event date unknown"}</p>
                </td>
                <td className="px-4 py-3.5">
                  {r.identityNeedsReview ? <Badge tone="amber">Check company</Badge> : <Badge tone="blue">Needs review</Badge>}
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {r.sources} cited {r.sources === 1 ? "source" : "sources"}
                  </p>
                </td>
                <td className="px-4 py-3.5 font-medium">{r.fitScore != null ? `${r.fitScore}/100` : "—"}</td>
                <td className="px-4 py-3.5 text-right">
                  <Link href={`/accounts/${r.accountId}`}>
                    <Button>Review</Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {pager}
      <p className="text-xs text-[var(--muted)]">
        <span className="font-semibold">Check company</span> = the article named the company but we couldn&apos;t confirm its website, so
        make sure it&apos;s the right firm. Priority is a ranking aid from fit, recency and source quality — not a purchase probability.
      </p>
    </section>
  );
}
