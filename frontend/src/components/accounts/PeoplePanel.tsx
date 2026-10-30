"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useWorkspace } from "../../hooks/useWorkspace";
import type { EvidenceItem } from "../../lib/api/accounts";
import {
  BUYING_ROLES,
  createContact,
  createRoleHypothesis,
  deleteContact,
  deleteRoleHypothesis,
  linkRoleHypothesis,
  listAccountPeople,
  type BuyingRole,
  type Contact,
  type RoleHypothesis,
} from "../../lib/api/contacts";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field, FormError, humanize, inputClass } from "../ui/Field";

const EMPTY_CONTACT = {
  name: "",
  title: "",
  buyingRole: "unknown" as BuyingRole,
  email: "",
  phone: "",
  sourceType: "user_entered" as "user_entered" | "evidence",
  evidenceId: "",
  sourceNote: "",
};
const EMPTY_HYPOTHESIS = { roleTitle: "", buyingRole: "unknown" as BuyingRole, rationale: "", evidenceIds: [] as string[] };

function evidenceLabel(e: EvidenceItem) {
  return e.sourceTitle || e.publisher || e.sourceUrl;
}

/**
 * People at the account (spec §7 Contact / RoleHypothesis). Sourced contacts and role
 * guesses are separate lists, so a hypothesis is never presented as a real person.
 */
export function PeoplePanel({
  accountId,
  workspaceId,
  evidence,
}: {
  accountId: string;
  workspaceId: string;
  evidence: EvidenceItem[];
}) {
  const { can } = useWorkspace();
  const canEdit = can("qualify");
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [hypotheses, setHypotheses] = useState<RoleHypothesis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<"contact" | "hypothesis" | null>(null);
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [hyp, setHyp] = useState(EMPTY_HYPOTHESIS);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listAccountPeople(accountId, workspaceId);
      setContacts(res.contacts);
      setHypotheses(res.roleHypotheses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load people");
      setContacts([]);
    }
  }, [accountId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setFormError(null);
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[16px]">People</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Contacts need a source. Role hypotheses are guesses about who matters, with no person attached.
          </p>
        </div>
        {canEdit && !form ? (
          <div className="flex gap-2">
            <Button onClick={() => { setFormError(null); setForm("contact"); }}>Add contact</Button>
            <Button onClick={() => { setFormError(null); setForm("hypothesis"); }}>Add role hypothesis</Button>
          </div>
        ) : null}
      </div>

      {error ? <FormError message={error} /> : null}

      {form === "contact" ? (
        <form
          className="mt-4 space-y-3 rounded-[10px] border border-[var(--line)] p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              createContact(accountId, workspaceId, {
                name: contact.name,
                title: contact.title || null,
                buyingRole: contact.buyingRole,
                email: contact.email || null,
                phone: contact.phone || null,
                sourceType: contact.sourceType,
                evidenceId: contact.sourceType === "evidence" ? contact.evidenceId || null : null,
                sourceNote: contact.sourceNote || null,
              }),
            );
            if (ok) {
              setContact(EMPTY_CONTACT);
              setForm(null);
            }
          }}
        >
          <h3 className="text-[14px]">Add a sourced contact</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <input className={inputClass} required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            </Field>
            <Field label="Job title">
              <input className={inputClass} value={contact.title} onChange={(e) => setContact({ ...contact, title: e.target.value })} placeholder="e.g. Head of IT Infrastructure" />
            </Field>
            <Field label="Buying role">
              <select className={inputClass} value={contact.buyingRole} onChange={(e) => setContact({ ...contact, buyingRole: e.target.value as BuyingRole })}>
                {BUYING_ROLES.map((r) => (
                  <option key={r} value={r}>{humanize(r)}</option>
                ))}
              </select>
            </Field>
            <Field label="Where did these details come from?" required>
              <select
                className={inputClass}
                value={contact.sourceType}
                onChange={(e) => setContact({ ...contact, sourceType: e.target.value as "user_entered" | "evidence" })}
              >
                <option value="user_entered">I know this person / told directly</option>
                <option value="evidence" disabled={!evidence.length}>
                  Named in cited evidence{evidence.length ? "" : " (no evidence yet)"}
                </option>
              </select>
            </Field>
            {contact.sourceType === "evidence" ? (
              <Field label="Evidence they appear in" required className="sm:col-span-2">
                <select className={inputClass} required value={contact.evidenceId} onChange={(e) => setContact({ ...contact, evidenceId: e.target.value })}>
                  <option value="">Choose a source…</option>
                  {evidence.map((ev) => (
                    <option key={ev.id} value={ev.id}>{evidenceLabel(ev)}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field
              label={contact.sourceType === "evidence" ? "Source note (optional)" : "Source note"}
              required={contact.sourceType === "user_entered"}
              hint="Who gave you these details, and when."
              className="sm:col-span-2"
            >
              <input
                className={inputClass}
                required={contact.sourceType === "user_entered"}
                value={contact.sourceNote}
                onChange={(e) => setContact({ ...contact, sourceNote: e.target.value })}
                placeholder="e.g. Introduced by our account manager on 14 Oct"
              />
            </Field>
            <Field label="Email (optional)">
              <input className={inputClass} type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </Field>
            <Field label="Phone (optional)">
              <input className={inputClass} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Contacts are saved as unverified. Only add details from a real source; never guess an email or phone number.
          </p>
          <FormError message={formError} />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={
                busy ||
                !contact.name.trim() ||
                (contact.sourceType === "user_entered" && !contact.sourceNote.trim()) ||
                (contact.sourceType === "evidence" && !contact.evidenceId)
              }
            >
              {busy ? "Saving…" : "Save contact"}
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {form === "hypothesis" ? (
        <form
          className="mt-4 space-y-3 rounded-[10px] border border-[var(--line)] p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => createRoleHypothesis(accountId, workspaceId, hyp));
            if (ok) {
              setHyp(EMPTY_HYPOTHESIS);
              setForm(null);
            }
          }}
        >
          <h3 className="text-[14px]">Add a role hypothesis</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role" required>
              <input className={inputClass} required value={hyp.roleTitle} onChange={(e) => setHyp({ ...hyp, roleTitle: e.target.value })} placeholder="e.g. Director of Digital Services" />
            </Field>
            <Field label="Buying role">
              <select className={inputClass} value={hyp.buyingRole} onChange={(e) => setHyp({ ...hyp, buyingRole: e.target.value as BuyingRole })}>
                {BUYING_ROLES.map((r) => (
                  <option key={r} value={r}>{humanize(r)}</option>
                ))}
              </select>
            </Field>
            <Field label="Why you think this role matters" required className="sm:col-span-2">
              <textarea
                className={inputClass}
                rows={2}
                required
                value={hyp.rationale}
                onChange={(e) => setHyp({ ...hyp, rationale: e.target.value })}
                placeholder="e.g. Data-centre projects at UK universities are usually owned by the digital services director"
              />
            </Field>
          </div>
          {evidence.length ? (
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-[var(--muted)]">Supporting evidence (optional)</legend>
              {evidence.map((ev) => (
                <label key={ev.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={hyp.evidenceIds.includes(ev.id)}
                    onChange={(e) =>
                      setHyp({
                        ...hyp,
                        evidenceIds: e.target.checked ? [...hyp.evidenceIds, ev.id] : hyp.evidenceIds.filter((i) => i !== ev.id),
                      })
                    }
                  />
                  <span>{evidenceLabel(ev)}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <FormError message={formError} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || !hyp.roleTitle.trim() || !hyp.rationale.trim()}>
              {busy ? "Saving…" : "Save hypothesis"}
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {!form && formError ? <div className="mt-3"><FormError message={formError} /></div> : null}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="text-[14px]">
            Contacts <span className="font-normal text-[var(--muted)]">({contacts?.length ?? 0})</span>
          </h3>
          {contacts === null ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Loading…</p>
          ) : contacts.length ? (
            <ul className="mt-2 divide-y divide-[var(--line)]">
              {contacts.map((c) => {
                const ev = c.evidenceId ? evidenceById.get(c.evidenceId) : undefined;
                return (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {c.name}
                        {c.title ? <span className="font-normal text-[var(--muted)]"> · {c.title}</span> : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                        <span className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5">{humanize(c.buyingRole)}</span>
                        <span className="rounded bg-[var(--badge-amber-bg)] px-1.5 py-0.5 text-[var(--badge-amber-fg)]">Unverified</span>
                        {c.suppressed ? (
                          <span className="rounded bg-[var(--red-tint)] px-1.5 py-0.5 font-semibold text-[var(--red-active)]">Suppressed: do not contact</span>
                        ) : null}
                      </p>
                      {c.email || c.phone ? (
                        <p className="mt-1 text-xs">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Source:{" "}
                        {ev ? (
                          <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--red-active)]">
                            {evidenceLabel(ev)}
                          </a>
                        ) : c.sourceType === "evidence" ? (
                          "cited evidence"
                        ) : null}
                        {c.sourceNote ? `${ev || c.sourceType === "evidence" ? " · " : ""}${c.sourceNote}` : null}
                      </p>
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        aria-label={`Remove ${c.name}`}
                        title="Remove contact"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`Remove ${c.name} from this account?`)) void run(() => deleteContact(accountId, workspaceId, c.id));
                        }}
                        className="shrink-0 rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--red-tint)] hover:text-[var(--red-active)]"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">No sourced contacts yet.</p>
          )}
        </section>

        <section>
          <h3 className="text-[14px]">
            Role hypotheses <span className="font-normal text-[var(--muted)]">({hypotheses.length})</span>
          </h3>
          {hypotheses.length ? (
            <ul className="mt-2 divide-y divide-[var(--line)]">
              {hypotheses.map((h) => {
                const linked = h.contactId ? contactById.get(h.contactId) : undefined;
                return (
                  <li key={h.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {h.roleTitle}
                        <span className="ml-1.5 rounded bg-[var(--badge-blue-bg)] px-1.5 py-0.5 text-xs font-normal text-[var(--badge-blue-fg)]">
                          Hypothesis
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{humanize(h.buyingRole)} · {h.rationale}</p>
                      {h.evidenceIds.length ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Supported by{" "}
                          {h.evidenceIds
                            .map((id) => evidenceById.get(id))
                            .filter((e): e is EvidenceItem => Boolean(e))
                            .map(evidenceLabel)
                            .join(", ") || "cited evidence"}
                        </p>
                      ) : null}
                      {canEdit && contacts?.length ? (
                        <label className="mt-1.5 flex items-center gap-2 text-xs text-[var(--muted)]">
                          Filled by
                          <select
                            className="rounded border border-[var(--input-border)] bg-white px-1.5 py-0.5 text-xs text-[var(--foreground)]"
                            value={h.contactId ?? ""}
                            disabled={busy}
                            onChange={(e) => void run(() => linkRoleHypothesis(accountId, workspaceId, h.id, e.target.value || null))}
                          >
                            <option value="">Nobody found yet</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </label>
                      ) : linked ? (
                        <p className="mt-1 text-xs">Filled by {linked.name}</p>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        aria-label={`Remove hypothesis ${h.roleTitle}`}
                        title="Remove hypothesis"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`Remove the "${h.roleTitle}" hypothesis?`)) void run(() => deleteRoleHypothesis(accountId, workspaceId, h.id));
                        }}
                        className="shrink-0 rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--red-tint)] hover:text-[var(--red-active)]"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">No role hypotheses yet.</p>
          )}
        </section>
      </div>
    </Card>
  );
}
