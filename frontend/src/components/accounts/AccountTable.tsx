"use client";

import Link from "next/link";
import type { Account } from "../../lib/api/accounts";
import { formatDate } from "../../lib/utils/dates";
import { StatusBadge } from "../common/StatusBadge";
import { TableWrap } from "../ui/TableWrap";
import { usePagination } from "../ui/Pagination";

export function AccountTable({ accounts }: { accounts: Account[] }) {
  const { pageItems, pager, topRef } = usePagination(accounts);
  return (
    <div ref={topRef} className="scroll-mt-24">
      <TableWrap>
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Accounts</caption>
          <thead className="border-b border-[var(--line)] bg-[var(--table-head)] text-[12px] font-medium text-[var(--muted)]">
            <tr>
              <th scope="col" className="px-4 py-3">Account</th>
              <th scope="col" className="px-4 py-3">Domain</th>
              <th scope="col" className="px-4 py-3">Country</th>
              <th scope="col" className="px-4 py-3">Research</th>
              <th scope="col" className="px-4 py-3">Acceptance</th>
              <th scope="col" className="px-4 py-3">Priority</th>
              <th scope="col" className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((a) => (
              <tr key={a.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/accounts/detail?id=${a.id}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--red-active)]">
                    {a.name}
                  </Link>
                  {a.source !== "manual" ? <span className="ml-2 text-xs text-[var(--muted)]">{a.source}</span> : null}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{a.domain ?? "—"}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{a.country ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.researchState} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.acceptanceState} />
                </td>
                <td className="px-4 py-3 font-medium">{a.fitScore ?? "—"}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{formatDate(a.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {pager}
    </div>
  );
}
