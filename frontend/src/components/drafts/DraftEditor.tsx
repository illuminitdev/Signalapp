"use client";

import { PortalLink as Link } from "@/components/layout/PortalLink";
import { useEffect, useState } from "react";
import { approveDraft, saveDraft, type Draft } from "../../lib/api/drafts";
import { downloadFile } from "../../lib/api/accounts";
import { useWorkspace } from "../../hooks/useWorkspace";
import { formatDate } from "../../lib/utils/dates";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field, FormError, FormNotice, inputClass } from "../ui/Field";

export function DraftEditor({
  draft,
  workspaceId,
  onSaved,
}: {
  draft: Draft;
  workspaceId: string;
  onSaved: () => void;
}) {
  const { can } = useWorkspace();
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSubject(draft.subject ?? "");
    setBody(draft.body);
  }, [draft.subject, draft.body, draft.version]);

  const dirty = subject !== (draft.subject ?? "") || body !== draft.body;
  const hypotheses = JSON.parse(draft.hypothesesJson || "[]") as string[];
  const citations = (JSON.parse(draft.evidenceIdsJson || "[]") as string[]).length;
  const editable = can("drafts");

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          <Link href={`/accounts/detail?id=${draft.accountId}`} className="hover:text-[var(--red-active)]">
            {draft.accountName}
          </Link>{" "}
          <span className="font-normal text-[var(--muted)]">
            · {draft.channel.replace("_", " ")} · v{draft.version} · updated {formatDate(draft.updatedAt)}
          </span>
        </p>
        <div className="flex gap-1.5">
          <Badge tone="blue">{citations} cited source{citations === 1 ? "" : "s"}</Badge>
          {draft.approvedAt ? <Badge tone="green">Reviewed & approved</Badge> : <Badge tone="amber">Needs review</Badge>}
        </div>
      </div>
      {draft.staleWarning ? (
        <p role="alert" className="rounded-[7px] bg-[var(--badge-amber-bg)] px-3 py-2 text-sm text-[var(--badge-amber-fg)]">
          At least one cited source is stale. Re-check it before using this draft.
        </p>
      ) : null}
      {hypotheses.length ? (
        <p className="text-xs text-[var(--muted)]">
          Contains {hypotheses.length} hypothesis line{hypotheses.length === 1 ? "" : "s"} — confirm them with the prospect, don&apos;t state them as fact.
        </p>
      ) : null}
      <Field label="Subject">
        <input className={inputClass} value={subject} disabled={!editable} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message">
        <textarea
          className={`${inputClass} font-mono`}
          rows={12}
          value={body}
          disabled={!editable}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <FormError message={error} />
      <FormNotice message={notice} />
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy || !dirty}
            onClick={() =>
              act(
                () => saveDraft(draft.id, { workspaceId, expectedVersion: draft.version, subject, body }),
                "Saved. Edits need a fresh review before export.",
              )
            }
          >
            Save edits
          </Button>
          {!draft.approvedAt ? (
            <Button
              disabled={busy || dirty}
              onClick={() => act(() => approveDraft(draft.id, workspaceId, draft.version), "Approved for export.")}
            >
              I&apos;ve reviewed it — approve
            </Button>
          ) : null}
          {can("export") ? (
            <Button
              variant="ghost"
              disabled={busy || !draft.approvedAt || dirty}
              onClick={() =>
                act(
                  () => downloadFile(`/v1/drafts/${draft.id}/export?workspaceId=${workspaceId}`, `draft-${draft.accountName}.txt`),
                  "Downloaded. Send it from your own mailbox — SignalApp never sends messages.",
                )
              }
            >
              Export approved text
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
