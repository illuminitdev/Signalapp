"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RequireCap } from "@/components/common/RequireCap";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { getOffer, type Playbook } from "@/lib/api/settings";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { humanize } from "@/components/ui/Field";

const ABOUT: Record<string, { blurb: string; question: string }> = {
  infrastructure: {
    blurb: "Facility growth, compute and storage capacity, refresh and procurement events.",
    question: "Where is new infrastructure creating a buying window?",
  },
  recruitment: {
    blurb: "Infrastructure and platform hiring that suggests change is coming.",
    question: "Which teams are staffing up for a refresh or migration?",
  },
  managed_it: {
    blurb: "Multi-site estates, refresh cycles and changes of support provider.",
    question: "Where would managed infrastructure services land next?",
  },
};

function Playbooks({ workspaceId }: { workspaceId: string }) {
  const [playbooks, setPlaybooks] = useState<Playbook[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOffer(workspaceId)
      .then((r) => setPlaybooks(r.playbooks))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load playbooks"));
  }, [workspaceId]);

  if (error) return <ErrorState message={error} />;
  if (!playbooks) return <LoadingState />;

  return (
    <div>
      <PageHeader
        eyebrow="Playbooks"
        title="Signal playbooks"
        description="Versioned templates for which signals to look for. The playbook version used is stored with every research run."
      />
      {!playbooks.length ? (
        <EmptyState title="No playbooks" detail="An admin can load the defaults by running the database seed." />
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          {playbooks.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <h2 className="text-[17px]">
                {p.name} <span className="text-sm font-normal text-[var(--muted)]">v{p.version}</span>
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{ABOUT[p.templateKey]?.blurb}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(p.rules.signals ?? []).map((s) => (
                  <Chip key={s}>{humanize(s)}</Chip>
                ))}
              </div>
              {ABOUT[p.templateKey] ? (
                <p className="mt-4 text-sm">
                  <span className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Discovery question</span>
                  <br />
                  {ABOUT[p.templateKey]!.question}
                </p>
              ) : null}
              <div className="mt-auto pt-5">
                <Link href="/researcher/search">
                  <Button variant="primary" className="w-full">
                    Search with this playbook
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlaybooksPage() {
  return <RequireCap cap="discover">{(workspaceId) => <Playbooks workspaceId={workspaceId} />}</RequireCap>;
}
