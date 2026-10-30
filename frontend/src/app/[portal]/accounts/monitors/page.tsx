"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  listMonitors,
  createMonitorFromPlaybook,
  updateMonitor,
  deleteMonitor,
  simulateChangeCheck,
  listChangeEvents,
  type Monitor,
  type ChangeEvent,
} from "@/lib/api/monitors";
import { formatDate } from "@/lib/utils/dates";

function getRecipeSubtitle(recipeJson: string): string {
  try {
    const r = JSON.parse(recipeJson);
    const territory =
      Array.isArray(r.territory) && r.territory.length > 0
        ? r.territory.join(", ")
        : "Texas";
    const windowDays = r.eventWindowDays ?? 180;
    return `${territory} · ${windowDays} day window`;
  } catch {
    return "Texas · 180 day window";
  }
}

function renderDetailWithLinks(detail: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = detail.split(urlRegex);

  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//i)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--red-active)] underline underline-offset-2 hover:opacity-80 break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function MonitorsView({ workspaceId }: { workspaceId: string }) {
  const [monitorsList, setMonitorsList] = useState<Monitor[] | null>(null);
  const [changeEventsList, setChangeEventsList] = useState<ChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [mRes, cRes] = await Promise.all([
        listMonitors(workspaceId),
        listChangeEvents(workspaceId),
      ]);
      setMonitorsList(mRes.monitors);
      setChangeEventsList(cRes.changeEvents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load monitors");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddPlaybook = async () => {
    try {
      setCreating(true);
      setError(null);
      await createMonitorFromPlaybook(workspaceId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add monitor from playbook");
    } finally {
      setCreating(false);
    }
  };

  const handleFrequencyChange = async (monitorId: string, cadenceHours: number) => {
    try {
      await updateMonitor(workspaceId, monitorId, { cadenceHours });
      setMonitorsList((prev) =>
        prev
          ? prev.map((m) => (m.id === monitorId ? { ...m, cadenceHours } : m))
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update frequency");
    }
  };

  const handleToggleStatus = async (monitorId: string, status: "active" | "paused") => {
    try {
      await updateMonitor(workspaceId, monitorId, { status });
      setMonitorsList((prev) =>
        prev
          ? prev.map((m) => (m.id === monitorId ? { ...m, status } : m))
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle status");
    }
  };

  const handleRemove = async (monitorId: string) => {
    try {
      setDeletingId(monitorId);
      setError(null);
      await deleteMonitor(workspaceId, monitorId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove monitor");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSimulate = async (monitorId: string) => {
    try {
      setSimulatingId(monitorId);
      setError(null);
      await simulateChangeCheck(workspaceId, monitorId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimulatingId(null);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CONTINUOUS RESEARCH"
        title="Signal monitors"
        description="Review a saved targeting recipe and demonstrate a change check."
        actions={
          <Button
            variant="primary"
            onClick={handleAddPlaybook}
            disabled={creating}
          >
            {creating ? "Adding..." : "Add current playbook"}
          </Button>
        }
      />

      {error ? <ErrorState message={error} /> : null}

      {!monitorsList || monitorsList.length === 0 ? (
        <Card className="flex items-center justify-center py-16 text-center text-sm text-[var(--muted)]">
          No monitors yet. Add your current playbook to demonstrate recurring research.
        </Card>
      ) : (
        <div className="space-y-4">
          {monitorsList.map((m) => (
            <Card key={m.id} className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[var(--foreground)]">{m.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {getRecipeSubtitle(m.recipeJson)}
                  </p>
                </div>
                {m.isSimulation ? (
                  <span className="rounded bg-[#fef3c7] px-2.5 py-1 text-xs font-medium text-[#92400e]">
                    Simulation only
                  </span>
                ) : (
                  <span className="rounded bg-[#dcfce7] px-2.5 py-1 text-xs font-medium text-[#166534]">
                    Live Exa research
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3 sm:gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--foreground)]">
                    Frequency
                  </label>
                  <select
                    value={m.cadenceHours}
                    onChange={(e) => handleFrequencyChange(m.id, Number(e.target.value))}
                    className="rounded-[6px] border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--foreground)] shadow-sm focus:outline-none focus:ring-1 focus:ring-[var(--red)]"
                  >
                    <option value={24}>Daily</option>
                    <option value={168}>Weekly</option>
                    <option value={720}>Monthly</option>
                  </select>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 pb-1.5 text-sm font-semibold text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={m.status === "active"}
                    onChange={(e) =>
                      handleToggleStatus(m.id, e.target.checked ? "active" : "paused")
                    }
                    className="h-4 w-4 rounded border-gray-300 accent-[var(--red)]"
                  />
                  Active
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2 pb-1.5 text-sm font-semibold text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={!m.isSimulation}
                    onChange={async (e) => {
                      const live = e.target.checked;
                      try {
                        await updateMonitor(workspaceId, m.id, { isSimulation: !live });
                        setMonitorsList((prev) =>
                          prev
                            ? prev.map((item) =>
                                item.id === m.id ? { ...item, isSimulation: !live } : item,
                              )
                            : prev,
                        );
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to toggle live mode");
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 accent-[var(--red)]"
                  />
                  Live Exa search
                </label>

                <Button
                  variant="secondary"
                  onClick={() => handleSimulate(m.id)}
                  disabled={simulatingId === m.id}
                  className="font-normal"
                >
                  {simulatingId === m.id
                    ? "Checking..."
                    : m.isSimulation
                    ? "Simulate change check"
                    : "Check live changes"}
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => handleRemove(m.id)}
                  disabled={deletingId === m.id}
                  className="font-normal"
                >
                  {deletingId === m.id ? "Removing..." : "Remove"}
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span>
                  {m.lastAttemptAt
                    ? `Last checked: ${formatDate(m.lastAttemptAt)}`
                    : "No checks yet"}
                </span>
                {m.lastRunStatus && (
                  <>
                    <span>·</span>
                    {m.lastRunStatus === "success" || m.lastRunStatus === "fresh_signals" ? (
                      <span className="font-medium text-[var(--badge-green-fg)]">
                        Fresh signals found
                      </span>
                    ) : m.lastRunStatus === "exhausted_budget" ? (
                      <span className="font-medium text-[#b45309]">
                        Quota / budget exhausted
                      </span>
                    ) : m.lastRunStatus === "provider_outage" ? (
                      <span className="font-medium text-[var(--red)]">
                        Web provider outage
                      </span>
                    ) : (
                      <span className="font-medium text-[var(--muted)]">
                        No new signals
                      </span>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Change history section */}
      <div className="mt-8 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">Change history</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Recent buying signals and market evidence discovered by your monitors.
          </p>
        </div>

        {changeEventsList.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">
            {!monitorsList || monitorsList.length === 0
              ? "No change events recorded yet. Add a monitor above to start tracking changes."
              : monitorsList.some((m) => !m.isSimulation)
              ? "No change events recorded yet. Click \"Check live changes\" above or wait for scheduled monitoring to populate the feed."
              : "No change events recorded yet. Click \"Simulate change check\" above to populate the change feed."}
          </div>
        ) : (
          <div className="space-y-3">
            {changeEventsList.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[var(--foreground)]">{c.title}</h3>
                      {c.material ? (
                        <span className="rounded bg-[var(--badge-green-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--badge-green-fg)]">
                          Material signal
                        </span>
                      ) : null}
                    </div>
                    {c.detail ? (
                      <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                        {renderDetailWithLinks(c.detail)}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {formatDate(c.discoveredAt)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MonitorsPage() {
  return (
    <RequireCap cap="view_accounts">
      {(wsId) => <MonitorsView workspaceId={wsId} />}
    </RequireCap>
  );
}
