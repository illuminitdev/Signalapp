"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import {
  getAcceptanceGates,
  getOffer,
  saveAcceptanceGates,
  saveOffer,
} from "@/lib/api/settings";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, FormNotice, humanize, inputClass } from "@/components/ui/Field";

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Exclusions are one per line: company names can contain commas */
const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

const questionClass =
  "mt-2.5 w-full rounded-[7px] border border-[var(--input-border)] bg-white px-4 py-3 text-[15px] font-normal text-[var(--foreground)]";

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[15px] font-semibold text-[var(--foreground)]">
      {label}
      {children}
    </label>
  );
}

function OfferSettings({ workspaceId }: { workspaceId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState<number | undefined>();
  const [form, setForm] = useState({
    offering: "",
    buyerRoles: "",
    industries: "",
    companySizes: "",
    territory: "",
    exclusions: "",
    eventWindowDays: "",
    naturalLanguageBrief: "",
  });
  const [structured, setStructured] = useState<Record<string, unknown> | null>(null);
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [gates, setGates] = useState<string[]>([]);
  const [fieldKeys, setFieldKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  useEffect(() => {
    if (!savedOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSavedOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [savedOpen]);

  useEffect(() => {
    Promise.all([getOffer(workspaceId), getAcceptanceGates(workspaceId)])
      .then(([r, g]) => {
        const o = r.offer;
        if (o) {
          setVersion(o.version);
          setForm({
            offering: o.offering,
            buyerRoles: o.buyerRoles.join(", "),
            industries: o.industries.join(", "),
            companySizes: o.companySizes.join(", "),
            territory: o.territory.join(", "),
            exclusions: o.exclusions.join("\n"),
            eventWindowDays: String(o.eventWindowDays),
            naturalLanguageBrief: o.naturalLanguageBrief ?? "",
          });
          setStructured(o.structuredQuery);
          setUnsupported(o.unsupportedFilters);
        }
        setGates(g.gates.requiredKnownFields);
        setFieldKeys(g.fieldKeys);
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load settings"));
  }, [workspaceId]);

  if (!loaded) return error ? <ErrorState message={error} /> : <LoadingState />;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Offer & targeting"
        description="What you sell and who to look for. Discovery and research use these as defaults; anything that can't be applied as a filter is listed rather than silently ignored."
      />
      <Card>
        <form
          className="space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setNotice(null);
            // Native `required` accepts "," or whitespace, which would save as an empty list
            const missing = (
              [
                ["What do you sell?", form.offering.trim()],
                ["Target buyer functions", list(form.buyerRoles).length],
                ["Territory", list(form.territory).length],
              ] as const
            )
              .filter(([, ok]) => !ok)
              .map(([name]) => name);
            if (missing.length) {
              setError(`Please answer: ${missing.join(", ")}`);
              return;
            }
            try {
              const res = await saveOffer(workspaceId, {
                offering: form.offering.trim(),
                buyerRoles: list(form.buyerRoles),
                industries: list(form.industries),
                companySizes: list(form.companySizes),
                territory: list(form.territory),
                exclusions: lines(form.exclusions),
                eventWindowDays: Number(form.eventWindowDays) || 90,
                naturalLanguageBrief: form.naturalLanguageBrief || undefined,
                expectedVersion: version,
              });
              setVersion((v) => (v ?? 0) + 1);
              setForm((f) => ({ ...f, territory: res.territory.join(", ") }));
              setStructured(res.structuredQuery);
              setUnsupported(res.unsupportedFilters);
              setNotice("Saved.");
              setSavedOpen(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save");
            }
          }}
        >
          <div className="grid gap-x-6 gap-y-6 md:grid-cols-2">
            <Question label="What do you sell?">
              <textarea
                className={questionClass}
                rows={3}
                value={form.offering}
                onChange={set("offering")}
                placeholder="e.g. Specialist technology recruitment"
              />
            </Question>
            <Question label="Target buyer functions">
              <textarea
                className={questionClass}
                rows={3}
                value={form.buyerRoles}
                onChange={set("buyerRoles")}
                placeholder="e.g. Hiring manager, talent acquisition, IT leadership"
              />
            </Question>
            <Question label="Territory">
              <input
                className={questionClass}
                value={form.territory}
                onChange={set("territory")}
                placeholder="e.g. United States, United Kingdom"
              />
            </Question>
            <Question label="Exclude account names (one per line)">
              <textarea
                className={questionClass}
                rows={3}
                value={form.exclusions}
                onChange={set("exclusions")}
                placeholder={"e.g. Existing Client Ltd\ncompetitor.com"}
              />
            </Question>
          </div>

          <p className="rounded-[9px] bg-[var(--badge-blue-bg)] px-5 py-4 text-sm text-[var(--foreground)]">
            Territory is matched by country. Exclusions apply to discovery and the opportunity feed: add a company name or
            its website domain.
          </p>

          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-[var(--foreground)]">More targeting options</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Industries">
                <input
                  className={inputClass}
                  value={form.industries}
                  onChange={set("industries")}
                  placeholder="e.g. Financial Services, Healthcare"
                />
              </Field>
              <Field label="Company sizes (employees)">
                <input className={inputClass} value={form.companySizes} onChange={set("companySizes")} placeholder="e.g. 200-1000, 1000+" />
              </Field>
              <Field label="Event window (days, older = stale)">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={3650}
                  inputMode="numeric"
                  value={form.eventWindowDays}
                  onChange={set("eventWindowDays")}
                  placeholder="90"
                />
              </Field>
              <Field label="Natural-language brief" className="sm:col-span-2">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.naturalLanguageBrief}
                  onChange={set("naturalLanguageBrief")}
                  placeholder="e.g. UK banks and insurers expanding data centres or refreshing servers"
                />
              </Field>
            </div>
          </details>

          <FormError message={error} />
          <FormNotice message={notice} />
          <Button type="submit" variant="primary" className="px-5 py-2.5 text-[15px]">
            Save targeting
          </Button>
        </form>

        {unsupported.length ? (
          <div role="alert" className="mt-4 rounded-[7px] bg-[var(--badge-amber-bg)] p-3 text-sm text-[var(--badge-amber-fg)]">
            <p className="font-semibold">Not applied as filters:</p>
            <ul className="mt-1 list-disc pl-5">
              {unsupported.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {structured && (structured as { fromBrief?: unknown }).fromBrief ? (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold">How the brief was understood</summary>
            <pre className="mt-2 overflow-auto rounded bg-[var(--chip-bg)] p-3 text-xs">
              {JSON.stringify((structured as { fromBrief: unknown }).fromBrief, null, 2)}
            </pre>
          </details>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-[16px]">Acceptance gates</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Brief fields that must be known (not &quot;unknown&quot;) before a reviewer can accept. Reviewed evidence, an owner, a
          next action and no active suppression are always required. Unknown budget doesn&apos;t block acceptance unless you
          tick it here.
        </p>
        <div className="mt-3 grid gap-1.5 text-sm sm:grid-cols-3">
          {fieldKeys.map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gates.includes(k)}
                onChange={(e) => setGates((g) => (e.target.checked ? [...g, k] : g.filter((x) => x !== k)))}
              />
              {humanize(k)}
            </label>
          ))}
        </div>
        <Button
          className="mt-3"
          onClick={async () => {
            setGateNotice(null);
            try {
              await saveAcceptanceGates(workspaceId, gates);
              setGateNotice("Acceptance gates saved.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save gates");
            }
          }}
        >
          Save gates
        </Button>
        <FormNotice message={gateNotice} />
      </Card>

      {savedOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setSavedOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="offer-saved-title"
            className="w-full max-w-md rounded-[10px] border-t-4 border-[var(--red)] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="offer-saved-title" className="text-[18px]">
              Targeting saved
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Your offer and targeting are now the defaults for discovery. Next step: head to Discover to find prospects
              that match.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setSavedOpen(false)}>Stay here</Button>
              <Link
                href="/researcher/search"
                autoFocus
                className="inline-flex items-center justify-center rounded-[7px] border border-transparent bg-[var(--red)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--red-hover)]"
              >
                Go to Discover →
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OfferSettingsPage() {
  return <RequireCap cap="manage_settings">{(workspaceId) => <OfferSettings workspaceId={workspaceId} />}</RequireCap>;
}
