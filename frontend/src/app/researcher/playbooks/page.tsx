"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import {
  getOffer,
  setActivePlaybook,
  setEventWindow,
  type Playbook,
} from "@/lib/api/settings";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const PLAYBOOK_INFO: Record<
  string,
  {
    displayName: string;
    subtitle: string;
    requiredEvidence: string;
    discoveryQuestion: string;
  }
> = {
  infrastructure: {
    displayName: "Infrastructure expansion",
    subtitle: "Facility expansion + infrastructure hiring",
    requiredEvidence:
      "Dated announcement, matching company and location, relevant role with a known date.",
    discoveryQuestion:
      "Will the site use local compute, central infrastructure or cloud services?",
  },
  recruitment: {
    displayName: "Hiring demand",
    subtitle: "Open infrastructure role + business expansion",
    requiredEvidence:
      "Dated announcement, matching company and location, relevant role with a known date.",
    discoveryQuestion:
      "Which roles are proving difficult to fill, and are external recruitment partners involved?",
  },
  managed_it: {
    displayName: "Multi-site IT support",
    subtitle: "New site + operations hiring",
    requiredEvidence:
      "Dated announcement, matching company and location, relevant role with a known date.",
    discoveryQuestion:
      "Who will support the new site, and will existing providers cover this location?",
  },
};

function Playbooks({ workspaceId }: { workspaceId: string }) {
  const [playbooks, setPlaybooks] = useState<Playbook[] | null>(null);
  const [activeTemplateKey, setActiveTemplateKey] = useState<string>("infrastructure");
  const [eventWindowDays, setEventWindowDays] = useState<number>(90);
  const [error, setError] = useState<string | null>(null);
  const [activatingKey, setActivatingKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await getOffer(workspaceId);
      setPlaybooks(res.playbooks);
      if (res.offer) {
        if (res.offer.activePlaybookTemplateKey) {
          setActiveTemplateKey(res.offer.activePlaybookTemplateKey);
        }
        if (res.offer.eventWindowDays) {
          setEventWindowDays(res.offer.eventWindowDays);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load playbooks");
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUsePlaybook = async (templateKey: string) => {
    try {
      setActivatingKey(templateKey);
      setError(null);
      await setActivePlaybook(workspaceId, templateKey);
      setActiveTemplateKey(templateKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate playbook");
    } finally {
      setActivatingKey(null);
    }
  };

  const handleEventWindowChange = async (days: number) => {
    setEventWindowDays(days);
    try {
      setError(null);
      await setEventWindow(workspaceId, days);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update event age");
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!playbooks) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="REPEATABLE RESEARCH"
        title="Signal playbooks"
        description="Choose a sales context and review the rules before finding accounts."
      />

      {!playbooks.length ? (
        <EmptyState
          title="No playbooks"
          detail="An admin can load the defaults by running the database seed."
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {playbooks.map((p) => {
            const info = PLAYBOOK_INFO[p.templateKey] ?? {
              displayName: p.name,
              subtitle: "Signal template",
              requiredEvidence:
                "Dated announcement, matching company and location, relevant role with a known date.",
              discoveryQuestion: "What is driving the buying window for this account?",
            };
            const isActive = p.templateKey === activeTemplateKey;

            return (
              <Card key={p.id} className="flex flex-col">
                <div className="mb-3 flex items-center justify-between">
                  {isActive ? (
                    <span className="rounded bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                      Active
                    </span>
                  ) : (
                    <span className="rounded bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      Template
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-[var(--foreground)]">
                  {info.displayName}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{info.subtitle}</p>

                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    Required evidence
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                    {info.requiredEvidence}
                  </p>
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    Discovery question
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                    {info.discoveryQuestion}
                  </p>
                </div>

                <div className="mt-auto pt-6">
                  {isActive ? (
                    <Button
                      variant="secondary"
                      disabled
                      className="w-full text-sm font-medium text-[var(--muted)] bg-gray-50 border-gray-200 cursor-default"
                    >
                      Active
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => handleUsePlaybook(p.templateKey)}
                      disabled={activatingKey === p.templateKey}
                      className="w-full text-sm"
                    >
                      {activatingKey === p.templateKey ? "Activating..." : "Use playbook"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Maximum event age card */}
      <Card className="mt-8">
        <div className="max-w-xl space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--foreground)]">
              Maximum event age
            </label>
            <select
              value={eventWindowDays}
              onChange={(e) => handleEventWindowChange(Number(e.target.value))}
              className="w-full rounded-[6px] border border-[var(--line)] bg-white px-3.5 py-2 text-sm text-[var(--foreground)] shadow-sm focus:outline-none focus:ring-1 focus:ring-[var(--red)]"
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>

          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Sample searches use Sep 26, 2026 as the fixed assessment date. Unknown hiring dates remain flagged for review.
          </p>

          <div className="pt-2">
            <Link href="/researcher/search">
              <Button variant="secondary" className="text-sm font-medium">
                Find sample matches →
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function PlaybooksPage() {
  return (
    <RequireCap cap="discover">
      {(workspaceId) => <Playbooks workspaceId={workspaceId} />}
    </RequireCap>
  );
}
