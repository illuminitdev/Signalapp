"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getPartnerView, transitionHandoff, type PartnerView } from "@/lib/api/handoffs";
import { formatDate } from "@/lib/utils/dates";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, humanize, inputClass } from "@/components/ui/Field";

function SharedBrief({ workspaceId, handoffId }: { workspaceId: string; handoffId: string }) {
  const [view, setView] = useState<PartnerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setView(await getPartnerView(handoffId, workspaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, [handoffId, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!view) return error ? <ErrorState message={error} /> : <LoadingState />;
  const { handoff, account, facts, evidence } = view;

  async function move(toState: "acknowledged" | "returned") {
    setBusy(true);
    setError(null);
    try {
      await transitionHandoff(handoffId, { workspaceId, toState, returnReason: toState === "returned" ? returnReason : undefined });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[790px] space-y-5">
      <PageHeader
        eyebrow="Shared account"
        title={String(account.name ?? "Shared account")}
        actions={
          <Link href="/shared">
            <Button>Back</Button>
          </Link>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--muted)]">Due {formatDate(handoff.dueAt)}</p>
          <StatusBadge status={handoff.state} />
        </div>
        {handoff.reason ? <p className="mt-3 text-sm"><span className="font-semibold">Why: </span>{handoff.reason}</p> : null}
        {handoff.nextAction ? <p className="mt-1 text-sm"><span className="font-semibold">Next action: </span>{handoff.nextAction}</p> : null}
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(account).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold text-[var(--muted)]">{humanize(k)}</dt>
              <dd>{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {facts.length ? (
        <Card>
          <h2 className="text-[16px]">Qualification</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            {facts.map((f) => (
              <div key={f.fieldKey}>
                <dt className="inline font-semibold">{humanize(f.fieldKey)}: </dt>
                <dd className="inline">
                  {f.value ?? "Unknown"} <span className="text-xs text-[var(--muted)]">({humanize(f.basis)})</span>
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      {evidence.length ? (
        <Card>
          <h2 className="text-[16px]">Sources</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {evidence.map((e) => (
              <li key={e.sourceUrl}>
                <a href={e.sourceUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-[var(--red-active)] hover:underline">
                  {e.sourceTitle || e.sourceUrl}
                </a>
                <p className="text-xs text-[var(--muted)]">
                  Event {e.eventDate ? formatDate(e.eventDate) : "unknown"} · discovered {formatDate(e.discoveredAt)} · checked {formatDate(e.checkedAt)}
                </p>
                {e.excerpt ? <p className="text-[var(--muted)]">{e.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {handoff.state === "shared" || handoff.state === "acknowledged" ? (
        <Card className="space-y-3">
          <h2 className="text-[16px]">Respond</h2>
          {handoff.state === "shared" ? (
            <Button variant="primary" disabled={busy} onClick={() => void move("acknowledged")}>
              Acknowledge — we&apos;ll take it from here
            </Button>
          ) : null}
          <Field label="Or hand it back (reason required)">
            <input className={inputClass} value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="e.g. Outside our service area" />
          </Field>
          <Button disabled={busy || !returnReason.trim()} onClick={() => void move("returned")}>
            Return to sender
          </Button>
          <FormError message={error} />
        </Card>
      ) : handoff.returnReason ? (
        <Card className="text-sm">Returned: {handoff.returnReason}</Card>
      ) : null}
    </div>
  );
}

export default function PartnerHandoffPage() {
  const handoffId = useSearchParams().get("id") ?? "";
  return (
    <RequireCap cap="acknowledge_handoff">
      {(workspaceId) => <SharedBrief workspaceId={workspaceId} handoffId={handoffId} />}
    </RequireCap>
  );
}
