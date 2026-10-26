"use client";

import { useEffect, useRef, useState } from "react";
import {
  downloadFile,
  getImport,
  listImports,
  previewImport,
  startImport,
  type ImportPreview,
} from "../../lib/api/accounts";
import { readFileAsText } from "../../lib/utils/csv";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field, FormError, inputClass } from "../ui/Field";

const MAX_BYTES = 2_000_000;
const FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "name", label: "Company name", required: true },
  { key: "domain", label: "Domain / website" },
  { key: "country", label: "Country" },
  { key: "legal_name", label: "Legal name" },
];

type Result = {
  id: string;
  status: string;
  totalRows: number;
  successRows: number;
  rowErrors: string[];
  createdAt?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Two-step import: preview + column mapping, then a queued job with a row report (R2). */
export function ImportCsvDialog({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // After a refresh: show the last import report, or keep following one still in progress
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { imports } = await listImports(workspaceId);
        const last = imports[0];
        if (!last || cancelled) return;
        if (last.status === "completed" || last.status === "failed") return setResult(last);
        setStatus("An import is still processing…");
        for (let i = 0; i < 120 && !cancelled; i++) {
          await sleep(1500);
          const { import: job } = await getImport(last.id, workspaceId);
          if (job.status === "completed" || job.status === "failed") {
            if (cancelled) return;
            setResult(job);
            setStatus(null);
            onDone();
            return;
          }
        }
      } catch {
        // no import history to show
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per workspace
  }, [workspaceId]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setError("Please choose a .csv file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    setBusy(true);
    try {
      const text = await readFileAsText(file);
      const p = await previewImport(workspaceId, text);
      setCsvText(text);
      setFileName(file.name);
      setPreview(p);
      setMapping(
        Object.fromEntries(Object.entries(p.suggestedMapping).filter(([, v]) => v)) as Record<string, string>,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCsvText(null);
    setPreview(null);
    setMapping({});
    setFileName("");
  }

  return (
    <Card>
      <h2 className="text-[15px]">Import accounts from CSV</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        UTF-8 CSV, up to 2 MB and 5,000 rows. Imported accounts start unresearched; possible duplicates go to merge
        review instead of being merged automatically.
      </p>

      {!preview ? (
        <div
          className={`mt-3 flex flex-col items-center gap-2 rounded-[7px] border border-dashed p-6 text-center ${
            dragOver ? "border-[var(--red)] bg-[var(--chip-bg)]" : "border-[var(--line)]"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy) void handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleFile(file);
            }}
          />
          <Button variant="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "Reading file…" : "Choose CSV file"}
          </Button>
          <p className="text-xs text-[var(--muted)]">or drag and drop it here</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            <span className="font-semibold">{fileName}</span> · {preview.rowCount} rows · columns:{" "}
            {preview.headers.join(", ")}
          </p>
          {preview.rowCount > preview.maxRows ? (
            <FormError message={`This file has more than ${preview.maxRows} rows. Split it before importing.`} />
          ) : null}
          {preview.errors.length ? (
            <div className="rounded-[7px] bg-[var(--badge-amber-bg)] p-3 text-xs text-[var(--badge-amber-fg)]">
              <p className="font-semibold">Rows that can&apos;t be read ({preview.errors.length}):</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.errors.slice(0, 5).map((er) => (
                  <li key={er}>{er}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " (required)" : ""}`}>
                <select
                  className={inputClass}
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">Not in this file</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy || !mapping.name || preview.rowCount > preview.maxRows}
              onClick={async () => {
                if (!csvText) return;
                setBusy(true);
                setError(null);
                try {
                  const { importJobId } = await startImport(workspaceId, csvText, mapping);
                  reset();
                  setStatus("Import queued — processing rows…");
                  for (let i = 0; i < 120; i++) {
                    await new Promise((r) => setTimeout(r, 1500));
                    const { import: job } = await getImport(importJobId, workspaceId);
                    if (job.status === "completed" || job.status === "failed") {
                      setResult(job);
                      setStatus(null);
                      onDone();
                      break;
                    }
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Import failed");
                  setStatus(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import {preview.rowCount} rows
            </Button>
            <Button variant="ghost" disabled={busy} onClick={reset}>
              Choose another file
            </Button>
          </div>
        </div>
      )}

      {status ? (
        <p className="mt-2 text-xs" role="status">
          {status}
        </p>
      ) : null}
      <FormError message={error} />
      {result ? (
        <div className="mt-3 text-sm" role="status">
          <p className="font-semibold">
            {result.createdAt ? `Last import (${new Date(result.createdAt).toLocaleString()}) ` : "Import "}
            {result.status}: {result.successRows} of {result.totalRows} rows imported
          </p>
          {result.rowErrors.length ? (
            <>
              <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-xs text-[var(--muted)]">
                {result.rowErrors.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <Button
                variant="quiet"
                className="mt-1 !px-0"
                onClick={() =>
                  void downloadFile(`/v1/imports/${result.id}/errors.csv?workspaceId=${workspaceId}`, "import-report.csv")
                }
              >
                Download row report
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
