"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/capabilities";

export default function HowItWorksPage() {
  const { role } = useWorkspace();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="How it works"
        title="How SignalApp works"
        description="Research, qualification and hand-off for infrastructure sales. SignalApp never sends emails or makes calls."
      />
      {role ? (
        <Card className="!py-4 text-sm">
          You&apos;re signed in as <span className="font-semibold">{ROLE_LABELS[role] ?? role}</span>: {ROLE_DESCRIPTIONS[role]}
        </Card>
      ) : null}
      <Card>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--foreground)]">
          <li>An admin sets the offer, territory and acceptance gates, and adds members with a role. Revoking a member takes effect on their next request.</li>
          <li>Researchers find companies (Discover → Find &amp; assign) or import a CSV. New accounts start unresearched; possible duplicates go to merge review.</li>
          <li>
            Research runs collect cited sources with separate event, discovery and check dates. Unknown dates stay unknown, contradictions are
            flagged, and finding nothing is never treated as a negative fact. Each run uses research units against a monthly cap.
          </li>
          <li>
            Evidence is reviewed, then the qualification brief is filled in. Every fact records its basis — unknown, hypothesis, observed in
            a source (with references), or confirmed by the prospect (with who said what and when).
          </li>
          <li>
            The researcher submits the brief. A sales reviewer accepts it (needs reviewed evidence, an accountable owner and a next action) or
            returns/rejects it with a reason. A material change after acceptance sends it back for re-review.
          </li>
          <li>SDRs work named tasks. Completing a task needs an outcome and only records activity — it never changes pipeline stage or logs a meeting.</li>
          <li>Drafts cite reviewed evidence and must be reviewed before export. Nothing is sent from SignalApp.</li>
          <li>
            Reviewers can hand an accepted account to a partner. A prepared handoff grants nothing until it is shared; the partner then sees only
            the fields you permitted.
          </li>
          <li>Reports count recorded events only and always show the cohort, denominator and currency.</li>
          <li>The suppression list is checked everywhere: import, discovery, research, contact tasks, acceptance, handoffs and exports.</li>
        </ol>
      </Card>
    </div>
  );
}
