"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "../../hooks/useWorkspace";
import {
  formatMoney,
  getOpportunity,
  OPPORTUNITY_STAGE_CLASSES,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGES,
  saveOpportunity,
  type Opportunity,
  type OpportunityStage,
} from "../../lib/api/opportunities";
import { formatDate } from "../../lib/utils/dates";
import { Button } from "../ui/Button";
import { Field, FormError, FormNotice, humanize, inputClass } from "../ui/Field";

export function OpportunityStageBadge({ stage }: { stage: OpportunityStage }) {
  return (
    <span className={`inline-flex rounded-[5px] px-2.5 py-1 text-sm font-medium ${OPPORTUNITY_STAGE_CLASSES[stage]}`}>
      {OPPORTUNITY_STAGE_LABELS[stage]}
    </span>
  );
}

/**
 * The account's deal: stage, value and currency. Recorded on its own, so changing it never
 * moves the sales-acceptance state, and accepting a brief never creates a deal (R5).
 */
export function OpportunityPanel({
  accountId,
  workspaceId,
  compact = false,
  onSaved,
}: {
  accountId: string;
  workspaceId: string;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const { can, currency: workspaceCurrency } = useWorkspace();
  const canEdit = can("manage_pipeline");
  const [opp, setOpp] = useState<Opportunity | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState<OpportunityStage>("qualified");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(workspaceCurrency);
  const [lostReason, setLostReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOpp((await getOpportunity(accountId, workspaceId)).opportunity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the opportunity");
      setOpp(null);
    }
  }, [accountId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit() {
    setStage(opp?.stage ?? "qualified");
    setValue(opp?.valueAmount != null ? String(opp.valueAmount) : "");
    setCurrency(opp?.currency ?? workspaceCurrency);
    setLostReason(opp?.lostReason ?? "");
    setNote(opp?.note ?? "");
    setError(null);
    setNotice(null);
    setEditing(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.replace(/[,\s£$€]/g, "");
    if (trimmed && !/^\d+$/.test(trimmed)) {
      setError("Enter the value as a whole number, e.g. 250000");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await saveOpportunity(accountId, workspaceId, {
        expectedVersion: opp?.version,
        stage,
        valueAmount: trimmed ? Number(trimmed) : null,
        currency: currency.trim().toUpperCase(),
        lostReason: stage === "lost" ? lostReason : null,
        note: note || null,
      });
      setOpp(res.opportunity);
      setEditing(false);
      setNotice(opp ? "Opportunity updated." : "Opportunity recorded.");
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save";
      setError(msg);
      if (/changed by someone else|just created/i.test(msg)) void load();
    } finally {
      setBusy(false);
    }
  }

  const heading = compact ? "text-[14px]" : "text-[16px]";

  if (opp === undefined) {
    return (
      <section>
        <h3 className={`mb-2 ${heading}`}>Opportunity</h3>
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`opp-${accountId}`} className={compact ? "" : "rounded-[12px] border border-[var(--line)] bg-white p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`opp-${accountId}`} className={heading}>
            Opportunity
          </h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            The deal itself, tracked separately from sales acceptance.
          </p>
        </div>
        {canEdit && !editing ? (
          <Button onClick={startEdit}>{opp ? "Update deal" : "Record a deal"}</Button>
        ) : null}
      </div>

      {!editing ? (
        opp ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-[var(--muted)]">Deal stage</dt>
              <dd className="mt-1">
                <OpportunityStageBadge stage={opp.stage} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[var(--muted)]">Value</dt>
              <dd className="mt-1 font-semibold tabular-nums">{formatMoney(opp.valueAmount, opp.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[var(--muted)]">Source</dt>
              <dd className="mt-1">{opp.source === "crm" ? "CRM" : "Entered by a user"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[var(--muted)]">CRM sync</dt>
              <dd className="mt-1">
                {humanize(opp.syncStatus)}
                {opp.syncedAt ? ` · ${formatDate(opp.syncedAt)}` : " · CRM not connected"}
              </dd>
            </div>
            <div className="col-span-2 text-xs text-[var(--muted)]">
              In this stage since {formatDate(opp.stageChangedAt)} · last updated {formatDate(opp.updatedAt)}
            </div>
            {opp.stage === "lost" && opp.lostReason ? (
              <div className="col-span-2">
                <dt className="text-xs font-semibold text-[var(--muted)]">Lost because</dt>
                <dd className="mt-1">{opp.lostReason}</dd>
              </div>
            ) : null}
            {opp.note ? (
              <div className="col-span-2">
                <dt className="text-xs font-semibold text-[var(--muted)]">Note</dt>
                <dd className="mt-1 whitespace-pre-wrap">{opp.note}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            No deal recorded yet.{canEdit ? " Record one once there is a real sales conversation." : ""}
          </p>
        )
      ) : (
        <form className="mt-3 space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Deal stage" required>
              <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value as OpportunityStage)}>
                {OPPORTUNITY_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {OPPORTUNITY_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Value (optional)" hint="Leave blank if unknown.">
              <input
                className={inputClass}
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 250000"
              />
            </Field>
            <Field label="Currency">
              <input
                className={inputClass}
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="GBP"
              />
            </Field>
          </div>
          {stage === "lost" ? (
            <Field label="Why was it lost?" required>
              <input
                className={inputClass}
                required
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="e.g. Chose incumbent supplier on the framework"
              />
            </Field>
          ) : null}
          <Field label="Note (optional)">
            <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <FormError message={error} />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !/^[A-Za-z]{3}$/.test(currency) || (stage === "lost" && !lostReason.trim())}
            >
              {busy ? "Saving…" : "Save deal"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {!editing ? <FormError message={error} /> : null}
      <FormNotice message={notice} />
    </section>
  );
}
