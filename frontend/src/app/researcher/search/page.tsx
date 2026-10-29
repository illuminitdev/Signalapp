"use client";

import { useCallback, useEffect, useState } from "react";
import { usePagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { ResearchRunStatus } from "@/components/research/ResearchRunStatus";
import { RequireCap } from "@/components/common/RequireCap";
import { DiscoveryResults } from "@/components/research/DiscoveryResults";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  listResearchRuns,
  parseBrief,
  startResearchRun,
  type DiscoveryRow,
  type ParsedBrief,
  type ResearchRunSummary,
} from "@/lib/api/research";
import { formatDate } from "@/lib/utils/dates";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getOffer, type Offer, type Playbook } from "@/lib/api/settings";
import { makeExclusionMatcher } from "@/lib/utils/exclusions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, humanize, inputClass } from "@/components/ui/Field";

const SIGNALS = ["expansion", "infra_hiring", "refresh", "compute", "procurement"];
const PLAYBOOK_DISPLAY_NAMES: Record<string, string> = {
  infrastructure: "Infrastructure expansion",
  recruitment: "Hiring demand",
  managed_it: "Multi-site IT support",
};
const SIGNAL_LABELS: Record<string, string> = {
  expansion: "Expansion",
  infra_hiring: "Hiring demand",
  refresh: "Hardware refresh",
  compute: "Compute demand",
  procurement: "Procurement",
};
const signalLabel = (s: string) => SIGNAL_LABELS[s] ?? humanize(s);
const split = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function SearchView({ workspaceId }: { workspaceId: string }) {
  const { can } = useWorkspace();
  // Typed text and choices survive a refresh; results come back from the saved searches
  const [brief, setBrief] = usePersistentState(`${workspaceId}:search:brief`, "");
  const [parsed, setParsed] = useState<ParsedBrief | null>(null);
  const [countries, setCountries] = useState("");
  const [industries, setIndustries] = useState("");
  const [signals, setSignals] = useState<string[]>([]);
  const [windowDays, setWindowDays] = useState("");
  const [budget, setBudget] = usePersistentState(`${workspaceId}:search:budget`, 5);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [playbookId, setPlaybookId] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [editing, setEditing] = useState(false);
  const [runId, setRunId] = usePersistentState<string | null>(`${workspaceId}:search:run`, null);
  const [recent, setRecent] = useState<ResearchRunSummary[]>([]);
  const [found, setFound] = useState<DiscoveryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recentPages = usePagination(recent);

  const loadRecent = useCallback(async () => {
    try {
      const { runs } = await listResearchRuns(workspaceId, { mode: "discovery", limit: 10 });
      setRecent(runs);
      // Reopen the search viewed last, or else the newest one
      setRunId((current) => (current && runs.some((r) => r.id === current) ? current : (runs[0]?.id ?? null)));
    } catch {
      setRecent([]);
    }
  }, [workspaceId, setRunId]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    void getOffer(workspaceId)
      .then((r) => {
        setOffer(r.offer);
        setPlaybooks(r.playbooks);
        const activeKey = r.offer?.activePlaybookTemplateKey ?? "infrastructure";
        setPlaybookId(r.playbooks.find((p) => p.templateKey === activeKey)?.id ?? r.playbooks[0]?.id ?? "");
      })
      .catch(() => setPlaybooks([]));
  }, [workspaceId]);

  // What will actually run: confirmed overrides, else the workspace targeting defaults
  const playbook = playbooks.find((p) => p.id === playbookId);
  const territory = countries ? split(countries) : (offer?.territory ?? []);
  const activeSignals = signals.length ? signals : (playbook?.rules.signals ?? []);
  const activeWindow = windowDays ? Number(windowDays) : (offer?.eventWindowDays ?? 90);
  const chips = [
    ...territory,
    ...(industries ? split(industries) : []),
    ...activeSignals.map(signalLabel),
    `Last ${activeWindow} days`,
  ];

  async function checkBrief() {
    setBusy(true);
    setError(null);
    try {
      const p = await parseBrief(workspaceId, brief);
      setParsed(p);
      setCountries(p.structured.countries.join(", "));
      setIndustries(p.structured.industries.join(", "));
      setSignals(p.structured.signalKinds);
      setWindowDays(p.structured.eventWindowDays ? String(p.structured.eventWindowDays) : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the brief");
    } finally {
      setBusy(false);
    }
  }

  async function findOpportunities() {
    setBusy(true);
    setError(null);
    setFound([]);
    try {
      const { researchRunId } = await startResearchRun(workspaceId, {
        mode: "discovery",
        query: brief.trim() || chips.join(" · "),
        brief: brief.trim() || undefined,
        budget,
        playbookVersionId: playbookId || undefined,
        filters: {
          countries: countries ? split(countries).map((c) => c.toUpperCase()) : undefined,
          industries: industries ? split(industries) : undefined,
          signalKinds: signals.length ? signals : undefined,
          eventWindowDays: windowDays ? Number(windowDays) : undefined,
        },
      });
      setRunId(researchRunId);
      void loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start discovery");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account discovery"
        title="Find prospects"
        description="Run explicit criteria against the pilot dataset."
      />

      <Card accent className="space-y-4">
        <Field label="Research brief">
          <textarea
            className={inputClass}
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. UK banks and insurers announcing data centre expansion or server refresh in the last 3 months"
          />
        </Field>
        <p className="text-xs text-[var(--muted)]">
          Free text is retained as a brief. Matching uses your structured territory, playbook, event age and exclusions
          below; live language interpretation is not connected.
        </p>

        {chips.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Current targeting">
            {chips.map((c) => (
              <li
                key={c}
                className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-3.5 py-1.5 text-sm text-[var(--foreground)]"
              >
                {c}
              </li>
            ))}
          </ul>
        ) : null}

        {editing ? (
          <div className="space-y-4 border-t border-[var(--line)] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px]">Targeting</h2>
              <Button variant="quiet" disabled={busy || !brief.trim()} onClick={() => void checkBrief()}>
                Fill from brief
              </Button>
            </div>
            {parsed?.unsupported.length ? (
              <div role="alert" className="rounded-[7px] bg-[var(--badge-amber-bg)] p-3 text-sm text-[var(--badge-amber-fg)]">
                <p className="font-semibold">These parts of the brief can&apos;t be applied as filters:</p>
                <ul className="mt-1 list-disc pl-5">
                  {parsed.unsupported.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Countries">
                <input className={inputClass} value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="e.g. GB, IE (empty = your territory)" />
              </Field>
              <Field label="Industries">
                <input className={inputClass} value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="e.g. Financial Services, Healthcare" />
              </Field>
              <Field label="Event window (days)">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  placeholder="e.g. 90 (empty = your default)"
                  value={windowDays}
                  onChange={(e) => setWindowDays(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <Field label="Playbook">
                <select className={inputClass} value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(PLAYBOOK_DISPLAY_NAMES[p.templateKey] ?? p.name)} v{p.version}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="text-xs font-semibold text-[var(--muted)]">Signals</legend>
              <div className="mt-1 flex flex-wrap gap-3 text-sm">
                {SIGNALS.map((s) => (
                  <label key={s} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={signals.includes(s)}
                      onChange={(e) => setSignals((x) => (e.target.checked ? [...x, s] : x.filter((y) => y !== s)))}
                    />
                    {humanize(s)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="result-count" className="block text-xs font-semibold text-[var(--muted)]">
                How many results? (1–10)
              </label>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="inline-flex items-center overflow-hidden rounded-[7px] border border-[var(--input-border)] bg-white">
                  <button
                    type="button"
                    aria-label="Fewer results"
                    disabled={budget <= 1}
                    onClick={() => setBudget((b) => Math.max(1, b - 1))}
                    className="flex h-9 w-9 items-center justify-center text-lg text-[var(--foreground)] hover:bg-[var(--chip-bg)] disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    id="result-count"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10}
                    value={budget}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) setBudget(Math.min(10, Math.max(1, Math.round(n))));
                    }}
                    aria-describedby="result-count-help"
                    className="h-9 w-14 border-x border-[var(--input-border)] text-center text-sm font-semibold text-[var(--foreground)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    aria-label="More results"
                    disabled={budget >= 10}
                    onClick={() => setBudget((b) => Math.min(10, b + 1))}
                    className="flex h-9 w-9 items-center justify-center text-lg text-[var(--foreground)] hover:bg-[var(--chip-bg)] disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm text-[var(--foreground)]">
                  Uses up to <span className="font-semibold">{budget}</span> research unit{budget === 1 ? "" : "s"}
                </span>
              </div>
              <p id="result-count-help" className="mt-1.5 text-xs text-[var(--muted)]">
                1 result = 1 unit. If fewer results are found, the unused units are given back.
                {parsed ? (
                  <>
                    {" "}
                    This month: {parsed.usage.usedMonthly} of {parsed.usage.quotaMonthly} units used ·{" "}
                    {Math.max(0, parsed.usage.quotaMonthly - parsed.usage.usedMonthly)} left.
                  </>
                ) : null}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Button onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? "Hide targeting" : "Edit targeting"}
          </Button>
          <Button variant="primary" disabled={busy || !can("discover")} onClick={() => void findOpportunities()}>
            {busy ? "Starting…" : "Find sample opportunities"}
          </Button>
        </div>
        <FormError message={error} />
      </Card>

      <ResearchRunStatus
        runId={runId}
        workspaceId={workspaceId}
        onFinished={(r) => {
          setFound(r.result?.rows ?? []);
          void loadRecent();
        }}
      />
      {runId && found.length ? (
        <DiscoveryResults rows={found.filter((r) => !makeExclusionMatcher(offer?.exclusions ?? [])(r))} runId={runId} workspaceId={workspaceId} canExport={can("export")} />
      ) : null}

      {recent.length > 1 ? (
        <Card>
          <h2 className="text-[15px]">Recent searches</h2>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {recentPages.pageItems.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={r.id === runId ? "true" : undefined}
                  onClick={() => {
                    setFound([]);
                    setRunId(r.id);
                  }}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left text-sm hover:bg-[var(--chip-bg)] ${
                    r.id === runId ? "bg-[var(--red-tint)]" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{r.brief ?? r.query}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]">
                    {r.companies != null ? `${r.companies} ${r.companies === 1 ? "company" : "companies"}` : <StatusBadge status={r.status} />}
                    <span>{formatDate(r.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {recentPages.pager}
        </Card>
      ) : null}
    </div>
  );
}

export default function SearchPage() {
  return <RequireCap cap="discover">{(workspaceId) => <SearchView workspaceId={workspaceId} />}</RequireCap>;
}

