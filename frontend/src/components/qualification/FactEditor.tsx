"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../../lib/api/client";
import type { EvidenceItem, Fact } from "../../lib/api/accounts";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field, FormError, FormNotice, humanize, inputClass } from "../ui/Field";

export const FIELD_KEYS = [
  "workload_use_case",
  "current_environment",
  "refresh_driver",
  "buying_timeframe",
  "stakeholders",
  "procurement_route",
  "incumbent_partner",
  "indicative_scope",
  "budget_status",
  "location",
  "incumbent_hardware",
  "deployment_model",
];

export const BASIS_LABELS: Record<string, string> = {
  unknown: "Unknown",
  research_hypothesis: "Research hypothesis",
  source_observed: "Observed in a source",
  prospect_confirmed: "Confirmed by the prospect",
};

export function FactEditor({
  accountId,
  workspaceId,
  version,
  rationale,
  facts,
  evidence,
  onSaved,
}: {
  accountId: string;
  workspaceId: string;
  version: number;
  rationale: string | null;
  facts: Fact[];
  evidence: EvidenceItem[];
  onSaved: () => void;
}) {
  const [fieldKey, setFieldKey] = useState(FIELD_KEYS[0]!);
  const [value, setValue] = useState("");
  const [basis, setBasis] = useState("unknown");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [rationaleText, setRationaleText] = useState(rationale ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rationaleState, setRationaleState] = useState<"idle" | "saving" | "saved">("idle");

  // Load the current value of the chosen field for editing
  useEffect(() => {
    const current = facts.find((f) => f.fieldKey === fieldKey);
    setValue(current?.value ?? "");
    setBasis(current?.basis ?? "unknown");
    setEvidenceIds(current ? (JSON.parse(current.evidenceIdsJson) as string[]) : []);
    setConfirmationNote("");
  }, [fieldKey, facts]);

  useEffect(() => setRationaleText(rationale ?? ""), [rationale]);

  /** Returns true when the save succeeded. */
  async function save(body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ version: number; reopenedForReview: boolean }>(
        `/v1/accounts/${accountId}/qualification?workspaceId=${workspaceId}`,
        { method: "PATCH", body: JSON.stringify({ expectedVersion: version, ...body }) },
      );
      setNotice(
        res.reopenedForReview
          ? `${done} This was a material change, so the accepted brief has been sent back for re-review.`
          : done,
      );
      onSaved();
      return true;
    } catch (err) {
      setError(
        err instanceof Error && /version|concurrent/i.test(err.message)
          ? "Someone else saved this brief first. The latest version has been loaded — check it and try again."
          : err instanceof Error
            ? err.message
            : "Save failed",
      );
      if (err instanceof Error && /version|concurrent/i.test(err.message)) onSaved();
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setRationaleState("saving");
            void save({ rationale: rationaleText }, "Rationale saved.").then((ok) =>
              setRationaleState(ok ? "saved" : "idle"),
            );
          }}
        >
          <h3 className="text-[15px]">Qualification rationale</h3>
          <Field label="Why this account is worth sales time">
            <textarea
              className={inputClass}
              rows={3}
              value={rationaleText}
              onChange={(e) => {
                setRationaleText(e.target.value);
                setRationaleState("idle");
              }}
              placeholder="e.g. Opening a new Leeds data centre in Q1; current servers are five years old"
            />
          </Field>
          <Button
            type="submit"
            disabled={busy || !rationaleText.trim() || rationaleState === "saved"}
            className={
              rationaleState === "saved"
                ? "!border-[var(--badge-green-bg)] !bg-[var(--badge-green-bg)] !text-[var(--badge-green-fg)] !opacity-100"
                : undefined
            }
          >
            <span className="inline-flex items-center gap-1.5">
              {rationaleState === "saved" ? <Check size={16} aria-hidden /> : null}
              {rationaleState === "saving" ? "Saving…" : rationaleState === "saved" ? "Saved" : "Save rationale"}
            </span>
          </Button>
        </form>
      </Card>

      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              {
                facts: [
                  {
                    fieldKey,
                    value: basis === "unknown" ? null : value.trim() || null,
                    basis,
                    evidenceIds: basis === "source_observed" ? evidenceIds : undefined,
                    confirmationNote: basis === "prospect_confirmed" ? confirmationNote : undefined,
                  },
                ],
              },
              `${humanize(fieldKey)} saved.`,
            );
          }}
        >
          <h3 className="text-[15px]">Edit a fact</h3>
          <p className="text-xs text-[var(--muted)]">
            Unknown is a valid answer. Never fill in budget, vendor, people or intent you can&apos;t support.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Field">
              <select className={inputClass} value={fieldKey} onChange={(e) => setFieldKey(e.target.value)}>
                {FIELD_KEYS.map((f) => (
                  <option key={f} value={f}>
                    {humanize(f)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Basis">
              <select className={inputClass} value={basis} onChange={(e) => setBasis(e.target.value)}>
                {Object.entries(BASIS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {basis !== "unknown" ? (
            <Field label="Value">
              <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Private cloud for claims systems" />
            </Field>
          ) : null}
          {basis === "source_observed" ? (
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-[var(--muted)]">Supporting evidence (required)</legend>
              {evidence.length ? (
                evidence.map((ev) => (
                  <label key={ev.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={evidenceIds.includes(ev.id)}
                      onChange={(e) =>
                        setEvidenceIds((ids) => (e.target.checked ? [...ids, ev.id] : ids.filter((i) => i !== ev.id)))
                      }
                    />
                    <span>{ev.sourceTitle || ev.sourceUrl}</span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No evidence on this account yet — run research first.</p>
              )}
            </fieldset>
          ) : null}
          {basis === "prospect_confirmed" ? (
            <Field
              label="Confirmation note (required): who said what, and when"
            >
              <textarea
                className={inputClass}
                rows={2}
                value={confirmationNote}
                onChange={(e) => setConfirmationNote(e.target.value)}
                placeholder="e.g. Jane Smith (IT Director) on a call on 14 Oct said the refresh is budgeted for Q2"
              />
            </Field>
          ) : null}
          <FormError message={error} />
          <FormNotice message={notice} />
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy ||
              (basis !== "unknown" && !value.trim()) ||
              (basis === "source_observed" && !evidenceIds.length) ||
              (basis === "prospect_confirmed" && !confirmationNote.trim())
            }
          >
            Save fact
          </Button>
        </form>
      </Card>
    </div>
  );
}
