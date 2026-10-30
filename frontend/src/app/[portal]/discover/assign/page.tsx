"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleCheck, ExternalLink, History, Trash2, X } from "lucide-react";
import { RequireCap } from "@/components/common/RequireCap";
import { StatusBadge } from "@/components/common/StatusBadge";
import { GuidedCard } from "@/components/guide/GuidedCard";
import { GuideHeader } from "@/components/guide/GuideHeader";
import { Stepper, type GuideStep } from "@/components/guide/Stepper";
import { TourHint } from "@/components/guide/TourHint";
import { ResearchRunStatus } from "@/components/research/ResearchRunStatus";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, FormError, humanize, inputClass } from "@/components/ui/Field";
import { usePagination } from "@/components/ui/Pagination";
import { useGuidedFlow } from "@/hooks/useGuidedFlow";
import { usePersistentState } from "@/hooks/usePersistentState";
import { usePortal } from "@/hooks/usePortal";
import { useWorkspace } from "@/hooks/useWorkspace";
import { downloadFile, listPeople } from "@/lib/api/accounts";
import {
  deleteResearchRun,
  getResearchRun,
  listResearchRuns,
  parseBrief,
  startResearchRun,
  type DiscoveryRow,
  type ParsedBrief,
  type ResearchRunSummary,
} from "@/lib/api/research";
import { getOffer, type Offer, type Playbook } from "@/lib/api/settings";
import { createTask } from "@/lib/api/tasks";
import { formatDate } from "@/lib/utils/dates";
import { makeExclusionMatcher } from "@/lib/utils/exclusions";
import { ROLE_LABELS } from "@/lib/auth/capabilities";

const ALL_STEPS: GuideStep[] = [
  { key: "find", label: "Find leads" },
  { key: "choose", label: "Choose leads" },
  { key: "assign", label: "Assign researcher" },
  { key: "done", label: "Done" },
];

const DEFAULT_INSTRUCTION =
  "Research and qualify this lead: check the evidence, fill in the qualification brief, then submit it for sales review.";

const SIGNALS = ["expansion", "infra_hiring", "refresh", "compute", "procurement"];
const PLAYBOOK_DISPLAY_NAMES: Record<string, string> = {
  infrastructure: "Infrastructure expansion",
  recruitment: "Hiring demand",
  managed_it: "Multi-site IT support",
};
const split = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

type Person = { userId: string; name: string; email: string; role: string };
type Assigned = { researcherName: string; due: string; ok: string[]; failed: Array<{ name: string; error: string }> };

function inDays(n: number) {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
}

function FindAndAssign({ workspaceId }: { workspaceId: string }) {
  const { can, user } = useWorkspace();
  const { portal } = usePortal();
  // Members who can't create tasks search and pick leads, but don't assign
  const canAssign = can("tasks");
  // Outside the admin portal (the researcher's own "Find leads"), chosen leads become your own tasks
  const selfOnly = portal.key !== "admin";
  const STEPS = (canAssign ? ALL_STEPS : ALL_STEPS.slice(0, 2)).map((s) =>
    selfOnly && s.key === "assign" ? { ...s, label: "Add to my leads" } : s,
  );

  const k = (s: string) => `${workspaceId}:assign:${s}`;
  const [brief, setBrief] = usePersistentState(k("brief"), "");
  const [runId, setRunId] = usePersistentState<string | null>(k("run"), null);
  const [selected, setSelected] = usePersistentState<string[]>(k("selected"), []);
  const [researcherId, setResearcherId] = usePersistentState(k("researcher"), "");
  const [due, setDue] = usePersistentState(k("due"), inDays(3));
  const [instruction, setInstruction] = usePersistentState(k("instruction"), DEFAULT_INSTRUCTION);
  const [assigned, setAssigned] = usePersistentState<Assigned | null>(k("assigned"), null);
  const [budget, setBudget] = usePersistentState(k("budget"), 5);

  // Advanced filters: empty means "use what the brief says, else the workspace defaults"
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [countries, setCountries] = useState("");
  const [industries, setIndustries] = useState("");
  const [signals, setSignals] = useState<string[]>([]);
  const [windowDays, setWindowDays] = useState("");
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [playbookId, setPlaybookId] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);

  const [parsed, setParsed] = useState<ParsedBrief | null>(null);
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [recent, setRecent] = useState<ResearchRunSummary[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recentPages = usePagination(recent, 5);

  // Results of the chosen search (also restores them after a refresh)
  const loadRun = useCallback(
    async (id: string) => {
      try {
        const { researchRun } = await getResearchRun(id, workspaceId);
        setRows(researchRun.result?.rows ?? []);
      } catch {
        setRows([]);
      }
    },
    [workspaceId],
  );

  const loadRecent = useCallback(async () => {
    try {
      const { runs } = await listResearchRuns(workspaceId, { mode: "discovery", limit: 50 });
      setRecent(runs);
    } catch {
      setRecent([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (runId) void loadRun(runId);
  }, [runId, loadRun]);

  useEffect(() => {
    void loadRecent();
    if (canAssign && !selfOnly) {
      void listPeople(workspaceId)
        .then((r) => setPeople(r.people))
        .catch(() => setPeople([]));
    }
    void getOffer(workspaceId)
      .then((r) => {
        setOffer(r.offer);
        setPlaybooks(r.playbooks);
        const activeKey = r.offer?.activePlaybookTemplateKey ?? "infrastructure";
        setPlaybookId(r.playbooks.find((p) => p.templateKey === activeKey)?.id ?? r.playbooks[0]?.id ?? "");
      })
      .catch(() => setPlaybooks([]));
  }, [workspaceId, canAssign, selfOnly, loadRecent]);

  const isExcluded = useMemo(() => makeExclusionMatcher(offer?.exclusions ?? []), [offer]);
  const leads = useMemo(() => rows.filter((r) => !isExcluded(r)), [rows, isExcluded]);
  const chosen = leads.filter((r) => selected.includes(r.accountId));
  const researchers = people.filter((p) => p.role === "researcher");
  const others = people.filter((p) => p.role === "tenant_admin");
  const researcher = selfOnly
    ? user
      ? { userId: user.id, name: "you" }
      : undefined
    : people.find((p) => p.userId === researcherId);

  const reachable = Math.min(STEPS.length - 1, assigned ? 3 : chosen.length ? 2 : leads.length ? 1 : 0);
  const flow = useGuidedFlow(`${workspaceId}:assign`, STEPS.length, reachable);

  function openRun(id: string) {
    setRows([]);
    setSelected([]);
    setRunId(id);
  }

  async function runSearch() {
    setBusy(true);
    setError(null);
    try {
      const p = await parseBrief(workspaceId, brief);
      setParsed(p);
      const s = p.structured;
      const { researchRunId } = await startResearchRun(workspaceId, {
        mode: "discovery",
        query: brief.trim(),
        brief: brief.trim(),
        budget,
        playbookVersionId: playbookId || undefined,
        // Filled-in advanced filters win over what was read from the brief
        filters: {
          countries: countries
            ? split(countries).map((c) => c.toUpperCase())
            : s.countries.length
              ? s.countries.map((c) => c.toUpperCase())
              : undefined,
          industries: industries ? split(industries) : s.industries.length ? s.industries : undefined,
          signalKinds: signals.length ? signals : s.signalKinds.length ? s.signalKinds : undefined,
          eventWindowDays: windowDays ? Number(windowDays) : (s.eventWindowDays ?? undefined),
        },
      });
      openRun(researchRunId);
      void loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the search");
    } finally {
      setBusy(false);
    }
  }

  async function removeRun(id: string) {
    if (!confirm("Are you sure you want to delete this search?")) return;
    try {
      await deleteResearchRun(workspaceId, id);
      setRecent((prev) => prev.filter((r) => r.id !== id));
      if (runId === id) {
        setRunId(null);
        setRows([]);
        setSelected([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete search");
    }
  }

  async function assign() {
    if (!researcher) return;
    setBusy(true);
    setError(null);
    const ok: string[] = [];
    const failed: Assigned["failed"] = [];
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    for (const lead of chosen) {
      try {
        await createTask({
          workspaceId,
          accountId: lead.accountId,
          type: "research",
          ownerUserId: researcher.userId,
          dueAt: new Date(`${due}T17:00:00`).toISOString(),
          timezone,
          instruction: instruction.trim() || undefined,
          // Same search + lead + researcher never creates a second task, even if clicked twice
          idempotencyKey: `assign:${runId}:${lead.accountId}:${researcher.userId}`,
        });
        ok.push(lead.name);
      } catch (e) {
        failed.push({ name: lead.name, error: e instanceof Error ? e.message : "Could not create the task" });
      }
    }
    setAssigned({ researcherName: researcher.name, due, ok, failed });
    setBusy(false);
    flow.goTo(3);
  }

  function startOver() {
    setAssigned(null);
    setSelected([]);
    flow.goTo(0);
  }

  const total = STEPS.length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <GuideHeader
        eyebrow="Discover · Find & assign"
        title={
          canAssign && selfOnly
            ? "Find new leads and add them to your own list, step by step."
            : canAssign
            ? "Find new leads and hand them to a researcher, step by step."
            : "Find new leads and pick the ones worth researching."
        }
        actions={
          <Button onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <span className="inline-flex items-center gap-1.5">
              <History size={15} aria-hidden /> History{recent.length ? ` (${recent.length})` : ""}
            </span>
          </Button>
        }
      />

      {showHistory ? (
        <section className="rounded-[16px] border border-[var(--line)] bg-white px-6 py-5 shadow-[0_10px_30px_-18px_rgba(23,44,64,0.25)] sm:px-9">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--foreground)]">Search history</h2>
              <p className="text-xs text-[var(--muted)]">
                Open a past search to see its results again. This doesn&apos;t use research units.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close history"
              onClick={() => setShowHistory(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--chip-bg)] hover:text-[var(--foreground)]"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">No searches yet in this workspace.</p>
          ) : (
            <>
              <ul className="divide-y divide-[var(--line)]">
                {recentPages.pageItems.map((r) => {
                  const current = r.id === runId;
                  return (
                    <li
                      key={r.id}
                      className={`flex items-center gap-2 rounded-lg p-1 ${current ? "bg-[var(--red-tint)]" : "hover:bg-[var(--chip-bg)]"}`}
                    >
                      <span className="min-w-0 flex-1 px-2 py-2 text-sm">
                        <span className="block truncate font-medium text-[var(--foreground)]">{r.brief ?? r.query}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
                          {r.companies != null ? (
                            <span>
                              {r.companies} {r.companies === 1 ? "company" : "companies"}
                            </span>
                          ) : (
                            <StatusBadge status={r.status} />
                          )}
                          <span>· {formatDate(r.createdAt)}</span>
                        </span>
                      </span>
                      <Button
                        variant="quiet"
                        aria-current={current ? "true" : undefined}
                        disabled={current}
                        onClick={() => {
                          openRun(r.id);
                          setShowHistory(false);
                          flow.goTo(0);
                        }}
                      >
                        {current ? "Open now" : "Open results"}
                      </Button>
                      <button
                        type="button"
                        aria-label="Delete this search"
                        title="Delete this search"
                        onClick={() => void removeRun(r.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--muted)] transition-colors hover:border-[var(--red)] hover:bg-[var(--red-tint)] hover:text-[var(--red-active)]"
                      >
                        <Trash2 size={15} strokeWidth={1.75} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {recentPages.pager}
            </>
          )}
        </section>
      ) : null}

      <Stepper steps={STEPS} current={flow.current} reachable={reachable} onSelect={flow.goTo} />

      {flow.current === 0 ? (
        <GuidedCard
          index={0}
          total={total}
          eyebrow="Find leads"
          title="Describe the companies you're looking for"
          why="SignalApp searches the web for companies showing a buying signal (expansion, hiring, hardware refresh, tenders) and saves each one as an account with its sources."
          onNext={flow.next}
          nextDisabledReason={leads.length ? null : runId ? "Waiting for the search to find companies…" : "Run a search first"}
        >
          <TourHint id="assign.find.brief">
            Write who you want in plain words, e.g. <em>UK universities upgrading data centres in the last 90 days</em>, then
            press <strong>Search</strong>. Each search uses a few research units.
          </TourHint>
          <Field label="What kind of companies?">
            <textarea
              className={inputClass}
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. UK universities announcing a new data centre or server refresh in the last 90 days"
            />
          </Field>

          <button
            type="button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--red-active)]"
          >
            {showAdvanced ? "▾ Hide advanced filters" : "▸ Advanced filters"}
          </button>

          {showAdvanced ? (
            <div className="mt-3 space-y-4 rounded-[10px] border border-[var(--line)] p-4">
              <p className="text-xs text-[var(--muted)]">
                Leave a field empty to use what your description says, or else your workspace defaults.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Countries">
                  <input
                    className={inputClass}
                    value={countries}
                    onChange={(e) => setCountries(e.target.value)}
                    placeholder={`e.g. GB, IE${offer?.territory.length ? ` (default: ${offer.territory.join(", ")})` : ""}`}
                  />
                </Field>
                <Field label="Industries">
                  <input
                    className={inputClass}
                    value={industries}
                    onChange={(e) => setIndustries(e.target.value)}
                    placeholder="e.g. Financial Services, Healthcare"
                  />
                </Field>
                <Field label="Event window (days)">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    placeholder={`e.g. 90 (default: ${offer?.eventWindowDays ?? 90})`}
                    value={windowDays}
                    onChange={(e) => setWindowDays(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="Playbook">
                  <select className={inputClass} value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
                    {playbooks.map((p) => (
                      <option key={p.id} value={p.id}>
                        {PLAYBOOK_DISPLAY_NAMES[p.templateKey] ?? p.name} v{p.version}
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
              <Field label="How many results? (1–10)">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10}
                  className={`${inputClass} w-24`}
                  value={budget}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setBudget(Math.min(10, Math.max(1, Math.round(n))));
                  }}
                />
                <span className="mt-1 block font-normal">
                  1 result = 1 research unit. Unused units are given back.
                  {parsed
                    ? ` This month: ${parsed.usage.usedMonthly} of ${parsed.usage.quotaMonthly} used.`
                    : ""}
                </span>
              </Field>
            </div>
          ) : null}

          <div className="mt-4">
            <Button variant="primary" disabled={busy || brief.trim().length < 5} onClick={() => void runSearch()}>
              {busy ? "Starting…" : "Search"}
            </Button>
          </div>

          {parsed ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {[...parsed.structured.countries, ...parsed.structured.industries, ...parsed.structured.signalKinds].map((c) => (
                <span key={c} className="rounded-full bg-[var(--chip-bg)] px-2.5 py-1">{c}</span>
              ))}
              {parsed.structured.eventWindowDays ? (
                <span className="rounded-full bg-[var(--chip-bg)] px-2.5 py-1">Last {parsed.structured.eventWindowDays} days</span>
              ) : null}
              {parsed.unsupported.length ? (
                <span className="text-[var(--badge-amber-fg)]">Not used: {parsed.unsupported.join(", ")}</span>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4">
            <ResearchRunStatus
              runId={runId}
              workspaceId={workspaceId}
              onFinished={(run) => {
                setRows(run.result?.rows ?? []);
                void loadRecent();
              }}
            />
          </div>
          {leads.length ? (
            <p className="mt-4 flex items-center gap-2 text-sm font-medium text-[var(--badge-green-fg)]">
              <CircleCheck size={16} aria-hidden /> {leads.length} compan{leads.length === 1 ? "y" : "ies"} found. Press Next to choose
              which ones to research.
            </p>
          ) : null}
          <div className="mt-3">
            <FormError message={error} />
          </div>
        </GuidedCard>
      ) : null}

      {flow.current === 1 ? (
        <GuidedCard
          index={1}
          total={total}
          eyebrow="Choose leads"
          title="Pick the companies worth researching"
          why={
            canAssign
              ? "Tick the leads that look promising. Each one you pick becomes a research task for the person you choose next."
              : "Every company found is already saved as an account. Open the pipeline to start researching the promising ones."
          }
          onBack={flow.back}
          onNext={canAssign ? flow.next : undefined}
          nextLabel={chosen.length ? `Next: ${selfOnly ? "add" : "assign"} ${chosen.length}` : "Next"}
          nextDisabledReason={chosen.length ? null : "Pick at least one company"}
        >
          <TourHint id="assign.choose">
            Read the trigger under each company. <strong>New</strong> means it wasn&apos;t in your accounts before. Suppressed
            companies are already left out.
          </TourHint>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-[var(--muted)]">
              {canAssign ? `${chosen.length} of ${leads.length} selected` : `${leads.length} companies found`}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {can("export") && runId ? (
                <button
                  type="button"
                  className="font-medium text-[var(--muted)] hover:underline"
                  onClick={() =>
                    void downloadFile(`/v1/research-runs/${runId}/results.csv?workspaceId=${workspaceId}`, "search-results.csv").catch((e) =>
                      setError(e instanceof Error ? e.message : "Export failed"),
                    )
                  }
                >
                  Export CSV
                </button>
              ) : null}
              {canAssign ? (
                <>
                  <button type="button" className="font-medium text-[var(--red-active)] hover:underline" onClick={() => setSelected(leads.map((l) => l.accountId))}>
                    Select all
                  </button>
                  <button type="button" className="font-medium text-[var(--muted)] hover:underline" onClick={() => setSelected([])}>
                    Clear
                  </button>
                </>
              ) : (
                <Link href="/accounts/pipeline" className="font-medium text-[var(--red-active)] hover:underline">
                  Open the pipeline
                </Link>
              )}
            </div>
          </div>
          <FormError message={error} />
          <ul className="divide-y divide-[var(--line)] rounded-[12px] border border-[var(--line)]">
            {leads.map((r) => {
              const on = selected.includes(r.accountId);
              const open = expanded === r.accountId;
              return (
                <li key={r.accountId} className={on ? "bg-[var(--red-tint)]" : undefined}>
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    {canAssign ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
                        checked={on}
                        onChange={(e) =>
                          setSelected((s) => (e.target.checked ? [...s, r.accountId] : s.filter((id) => id !== r.accountId)))
                        }
                      />
                    ) : null}
                    {/* Click the company to see its full details */}
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : r.accountId)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--foreground)]">{r.name}</span>
                          {r.domain ? <span className="text-xs text-[var(--muted)]">{r.domain}</span> : null}
                          {r.isNew ? <Badge tone="blue">New</Badge> : null}
                          {r.identityNeedsReview ? <Badge tone="amber">Check company</Badge> : null}
                        </span>
                        <span className="mt-0.5 block text-sm text-[var(--muted)]">
                          {r.trigger.title ?? r.trigger.summary ?? "Signal found"}
                          {r.trigger.eventDate ? ` · ${formatDate(r.trigger.eventDate)}` : ""}
                          {` · ${r.sources} source${r.sources === 1 ? "" : "s"}`}
                        </span>
                      </span>
                      {r.fitScore != null ? <span className="shrink-0 text-sm font-semibold tabular-nums">{r.fitScore}/100</span> : null}
                      <ChevronDown
                        size={18}
                        aria-hidden
                        className={`mt-0.5 shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>

                  {open ? (
                    <div className={`mx-4 mb-4 rounded-[10px] border border-[var(--line)] bg-white px-5 py-4 text-sm ${canAssign ? "ml-11" : ""}`}>
                      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold text-[var(--muted)]">Account</dt>
                          <dd className="mt-1 font-medium text-[var(--foreground)]">{r.name}</dd>
                          <dd className="text-xs text-[var(--muted)]">
                            {[r.domain, r.country].filter(Boolean).join(" · ") || "Website unknown"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-[var(--muted)]">Priority</dt>
                          <dd className="mt-1 font-medium text-[var(--foreground)]">{r.fitScore != null ? `${r.fitScore}/100` : "—"}</dd>
                          <dd className="text-xs text-[var(--muted)]">From fit, recency and source quality, not a purchase probability.</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs font-semibold text-[var(--muted)]">Trigger</dt>
                          {r.trigger.title ? <dd className="mt-1 font-medium text-[var(--foreground)]">{r.trigger.title}</dd> : null}
                          {r.trigger.summary ? <dd className="mt-1 text-[var(--foreground)]">{r.trigger.summary}</dd> : null}
                          <dd className="mt-1 text-xs text-[var(--muted)]">
                            {r.trigger.eventDate ? formatDate(r.trigger.eventDate) : "Event date unknown"} ·{" "}
                            <a
                              href={r.trigger.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 font-medium text-[var(--red-active)] hover:underline"
                            >
                              Open source <ExternalLink size={12} aria-hidden />
                            </a>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-[var(--muted)]">Evidence</dt>
                          <dd className="mt-1">
                            {r.identityNeedsReview ? <Badge tone="amber">Check company</Badge> : <Badge tone="blue">Needs review</Badge>}
                          </dd>
                          <dd className="mt-1 text-xs text-[var(--muted)]">
                            {r.sources} cited {r.sources === 1 ? "source" : "sources"}
                          </dd>
                        </div>
                        <div className="flex items-end sm:justify-end">
                          <Link href={`/accounts/detail?id=${r.accountId}`}>
                            <Button>Review account</Button>
                          </Link>
                        </div>
                      </dl>
                      {r.identityNeedsReview ? (
                        <p className="mt-4 text-xs text-[var(--muted)]">
                          <span className="font-semibold">Check company</span> = the article named the company but we couldn&apos;t
                          confirm its website, so make sure it&apos;s the right firm.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </GuidedCard>
      ) : null}

      {canAssign && flow.current === 2 ? (
        <GuidedCard
          index={2}
          total={total}
          eyebrow={selfOnly ? "Add to my leads" : "Assign researcher"}
          title={
            selfOnly
              ? `Add ${chosen.length === 1 ? "this lead" : `these ${chosen.length} leads`} to your list?`
              : `Who should research ${chosen.length === 1 ? "this lead" : `these ${chosen.length} leads`}?`
          }
          why={
            selfOnly
              ? "Each lead becomes a Research task for you. You'll find them under My leads → Qualify a lead, ready to check the evidence, fill in the brief and send for sales review."
              : "Each lead gets a Research task for this person. They will see it in their own portal, check the evidence, fill in the brief and send it for sales review."
          }
          onBack={flow.back}
          onNext={() => void assign()}
          nextLabel={`${selfOnly ? "Add" : "Assign"} ${chosen.length} lead${chosen.length === 1 ? "" : "s"}`}
          nextDisabledReason={!researcher ? "Choose a researcher" : !due ? "Pick a due date" : null}
          busy={busy}
        >
          <TourHint id={selfOnly ? "assign.self" : "assign.researcher"}>
            {selfOnly ? (
              <>
                Pick a due date and a reminder of what to check. Press <strong>Add</strong> to put the leads on your list.
              </>
            ) : (
              <>
                Pick the researcher, a due date and what you want checked. Press <strong>Assign</strong> to create the tasks.
              </>
            )}
          </TourHint>
          <div className="grid gap-4 sm:grid-cols-2">
            {selfOnly ? null : (
            <Field label="Researcher" required>
              <select className={inputClass} value={researcherId} onChange={(e) => setResearcherId(e.target.value)}>
                <option value="">Choose a person…</option>
                {researchers.length ? (
                  <optgroup label="Researchers">
                    {researchers.map((p) => (
                      <option key={p.userId} value={p.userId}>{p.name}</option>
                    ))}
                  </optgroup>
                ) : null}
                {others.length ? (
                  <optgroup label={ROLE_LABELS.tenant_admin}>
                    {others.map((p) => (
                      <option key={p.userId} value={p.userId}>{p.name}</option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              {!researchers.length ? (
                <span className="mt-1 block font-normal">No researchers in this workspace yet. Add one under Members.</span>
              ) : null}
            </Field>
            )}
            <Field label="Due date" required>
              <input type="date" className={inputClass} value={due} min={inDays(0)} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field label={selfOnly ? "Note to yourself" : "What should they do?"} className="sm:col-span-2">
              <textarea className={inputClass} rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
            </Field>
          </div>
          <div className="mt-5 rounded-[10px] bg-[var(--chip-bg)] px-4 py-3 text-sm">
            <p className="font-semibold">Leads to {selfOnly ? "add" : "assign"} ({chosen.length})</p>
            <p className="mt-1 text-[var(--muted)]">{chosen.map((c) => c.name).join(" · ")}</p>
          </div>
          {assigned ? (
            <p className="mt-3 rounded-[10px] bg-[var(--badge-amber-bg)] px-4 py-3 text-sm text-[var(--badge-amber-fg)]">
              {selfOnly ? (
                <>You already added these leads to your list. Adding them again won&apos;t create duplicate tasks.</>
              ) : (
                <>
                  You already sent {assigned.ok.length} lead{assigned.ok.length === 1 ? "" : "s"} to {assigned.researcherName}. Assigning
                  again to the same person won&apos;t create duplicate tasks; choosing someone else gives them their own task.
                </>
              )}
            </p>
          ) : null}
          <div className="mt-3">
            <FormError message={error} />
          </div>
        </GuidedCard>
      ) : null}

      {canAssign && flow.current === 3 && assigned ? (
        <GuidedCard
          index={3}
          total={total}
          eyebrow="Done"
          title={
            !assigned.ok.length
              ? "No tasks were created"
              : selfOnly
                ? `${assigned.ok.length} lead${assigned.ok.length === 1 ? "" : "s"} added to your list`
                : `${assigned.ok.length} lead${assigned.ok.length === 1 ? "" : "s"} sent to ${assigned.researcherName}`
          }
          why={
            selfOnly
              ? `You now have a Research task for each lead, due ${formatDate(`${assigned.due}T17:00:00`)}. Open Qualify a lead to work on them; each brief you send goes to a sales reviewer.`
              : `${assigned.researcherName} now has a Research task for each lead, due ${formatDate(`${assigned.due}T17:00:00`)}. When they submit a brief, it goes to a sales reviewer to accept, return or reject.`
          }
          onBack={flow.back}
        >
          {assigned.ok.length ? (
            <ul className="space-y-1.5 text-sm">
              {assigned.ok.map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <CircleCheck size={16} className="text-[var(--badge-green-fg)]" aria-hidden /> {n}
                </li>
              ))}
            </ul>
          ) : null}
          {assigned.failed.length ? (
            <div className="mt-4 rounded-[10px] bg-[var(--red-tint)] px-4 py-3 text-sm text-[var(--red-active)]">
              <p className="font-semibold">Not assigned ({assigned.failed.length})</p>
              {assigned.failed.map((f) => (
                <p key={f.name} className="mt-1">
                  {f.name}: {f.error}
                </p>
              ))}
            </div>
          ) : null}
          <div className="mt-7 flex flex-wrap gap-3">
            {selfOnly ? (
              <Link href="/accounts/qualify">
                <Button variant="primary">Qualify them now</Button>
              </Link>
            ) : null}
            <Link href="/outreach/tasks">
              <Button variant={selfOnly ? "secondary" : "primary"}>See the tasks</Button>
            </Link>
            <Link href="/accounts/pipeline">
              <Button>Open the pipeline</Button>
            </Link>
            <Button variant="ghost" onClick={startOver}>
              Find and assign more leads
            </Button>
          </div>
        </GuidedCard>
      ) : null}
    </div>
  );
}

export default function FindAndAssignPage() {
  return <RequireCap cap="discover">{(workspaceId) => <FindAndAssign workspaceId={workspaceId} />}</RequireCap>;
}
