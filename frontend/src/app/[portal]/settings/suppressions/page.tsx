"use client";

import { useCallback, useEffect, useState } from "react";
import { usePagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import {
  createSuppression,
  expireSuppression,
  listSuppressions,
  type Suppression,
} from "@/lib/api/suppressions";
import { formatDate } from "@/lib/utils/dates";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableWrap } from "@/components/ui/TableWrap";
import { Field, FormError, humanize, inputClass } from "@/components/ui/Field";

function Suppressions({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<Suppression[] | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("do_not_contact");
  const [source, setSource] = useState("manual");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pageItems, pager, topRef } = usePagination(rows ?? []);

  const refresh = useCallback(async () => {
    try {
      const r = await listSuppressions(workspaceId);
      setRows(r.suppressions);
      setReasons(r.reasons);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const now = Date.now();
  const active = (s: Suppression) => !s.expiresAt || new Date(s.expiresAt).getTime() > now;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Suppression list"
        description="Domains and addresses that must not be contacted. They're checked on import, discovery, research, contact-task creation, acceptance, handoff sharing and every export. Records are expired rather than deleted, so history is kept."
      />
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await createSuppression(workspaceId, {
                addressOrDomain: value,
                reason,
                source,
                expiresAt: expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null,
              });
              setValue("");
              setExpires("");
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not add");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="text-[15px]">Add a suppression</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Domain or email">
              <input className={inputClass} required value={value} onChange={(e) => setValue(e.target.value)} placeholder="example.com" />
            </Field>
            <Field label="Reason">
              <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {humanize(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source">
              <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="manual">Manual entry</option>
                <option value="verbal_request">Verbal request via SDR</option>
                <option value="written_request">Written request</option>
              </select>
            </Field>
            <Field label="Expires (optional)">
              <input type="date" className={inputClass} value={expires} onChange={(e) => setExpires(e.target.value)} />
            </Field>
          </div>
          <FormError message={error} />
          <Button type="submit" variant="primary" disabled={busy || !value.trim()}>
            Add suppression
          </Button>
        </form>
      </Card>

      {rows === null ? (
        error ? <ErrorState message={error} /> : <LoadingState />
      ) : rows.length ? (
        <div ref={topRef} className="scroll-mt-24">
          <TableWrap>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--table-head)] text-[12px] text-[var(--muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Domain / email</th>
                  <th scope="col" className="px-4 py-3">Reason</th>
                  <th scope="col" className="px-4 py-3">Source</th>
                  <th scope="col" className="px-4 py-3">Effective</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3 font-medium">{s.addressOrDomain}</td>
                    <td className="px-4 py-3">{humanize(s.reason)}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{humanize(s.source)}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{formatDate(s.effectiveAt)}</td>
                    <td className="px-4 py-3">
                      {active(s) ? (
                        <Badge tone="red">Active{s.expiresAt ? ` until ${formatDate(s.expiresAt)}` : ""}</Badge>
                      ) : (
                        <Badge>Expired {formatDate(s.expiresAt)}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {active(s) ? (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await expireSuppression(workspaceId, s.id);
                              await refresh();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Could not expire");
                            }
                          }}
                        >
                          Expire now
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {pager}
        </div>
      ) : (
        <EmptyState title="No suppressions" />
      )}
    </div>
  );
}

export default function SuppressionsPage() {
  return <RequireCap cap="manage_suppressions">{(workspaceId) => <Suppressions workspaceId={workspaceId} />}</RequireCap>;
}
