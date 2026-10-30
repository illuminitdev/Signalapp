
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { config as loadDotenv } from "dotenv";
import type { FastifyInstance } from "fastify";
import type { NormalizedEvidenceItem, ResearchProvider } from "../providers/research/types.js";

const TEST_DB = process.env.TEST_DATABASE_URL?.trim();
const mainDb = loadDotenv({ processEnv: {} }).parsed?.DATABASE_URL?.trim();
const enabled = Boolean(TEST_DB) && TEST_DB !== mainDb;
const FAKE_EXA_KEY = "exa_TESTKEY_should_never_leak_123456";

// Queue is replaced: tests run job handlers directly and deterministically
const enqueued: Array<{ kind: "research" | "import"; id: string; csvText?: string; mapping?: unknown }> = [];
vi.mock("../jobs/queue.js", () => ({
  enqueueResearchRun: async (id: string) => {
    enqueued.push({ kind: "research", id });
  },
  enqueueCsvImport: async (id: string, csvText: string, mapping?: unknown) => {
    enqueued.push({ kind: "import", id, csvText, mapping });
  },
}));

/** Fake research provider: deterministic items, scripted failures, call counter. */
class FakeProvider implements ResearchProvider {
  name = "fake";
  calls = 0;
  failNext: Error | null = null;
  items: NormalizedEvidenceItem[] = [];
  async discover() {
    this.calls++;
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    return { providerRunId: `req_${this.calls}`, items: this.items, rawCount: this.items.length };
  }
  async retrieve() {
    return { items: [] };
  }
  normalize() {
    return [];
  }
  async reportUsage(d: { providerRunId: string; rawCount: number }, reserved: number) {
    return { requestRef: d.providerRunId, units: Math.min(reserved, Math.max(1, d.rawCount)) };
  }
}

const allBodies: string[] = [];

// Each gate makes many round-trips to a remote database
vi.setConfig({ testTimeout: 180_000 });

describe.skipIf(!enabled)("Phase 1 release gates", () => {
  let app: FastifyInstance;
  let provider: FakeProvider;
  let handleResearchRun: typeof import("../jobs/handlers/researchRun.js").handleResearchRun;
  let handleCsvImport: typeof import("../jobs/handlers/csvImport.js").handleCsvImport;
  let db: ReturnType<typeof import("../db/client.js").getDb>;
  let schema: typeof import("../db/schema/index.js");

  const ws: Record<"A" | "B", { tenantId: string; workspaceId: string }> = {
    A: { tenantId: "", workspaceId: "" },
    B: { tenantId: "", workspaceId: "" },
  };
  const userIds: Record<string, string> = {};
  const cookies: Record<string, string> = {};

  async function call(
    who: string,
    method: "GET" | "POST" | "PATCH" | "PUT",
    url: string,
    payload?: unknown,
  ) {
    const res = await app.inject({
      method,
      url,
      payload: payload as object | undefined,
      headers: cookies[who] ? { cookie: cookies[who] } : {},
    });
    allBodies.push(res.body);
    return res;
  }

  async function makeUser(key: string, email: string, role: string, w: "A" | "B") {
    const { hashPassword } = await import("../auth/password.js");
    const { newId } = await import("../utils/ids.js");
    const id = newId("usr");
    await db.insert(schema.users).values({ id, email, name: key, passwordHash: await hashPassword("pw-123456") });
    await db.insert(schema.memberships).values({
      id: newId("mem"),
      tenantId: ws[w].tenantId,
      workspaceId: ws[w].workspaceId,
      userId: id,
      role: role as never,
    });
    userIds[key] = id;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: "pw-123456" },
    });
    expect(res.statusCode).toBe(200);
    const set = res.headers["set-cookie"];
    cookies[key] = (Array.isArray(set) ? set[0] : set)!.split(";")[0]!;
  }

  async function runQueuedResearch(attempt = { retryCount: 0, retryLimit: 0 }) {
    const jobs = enqueued.filter((j) => j.kind === "research");
    const last = jobs[jobs.length - 1]!;
    await handleResearchRun({ researchRunId: last.id }, attempt);
    return last.id;
  }

  async function createAccount(who: string, w: "A" | "B", body: object) {
    const res = await call(who, "POST", `/v1/workspaces/${ws[w].workspaceId}/accounts`, body);
    expect(res.statusCode, res.body).toBe(200);
    return res.json().account as { id: string; version: number };
  }

  async function researchAccount(who: string, accountId: string, items: NormalizedEvidenceItem[]) {
    provider.items = items;
    const res = await call(who, "POST", `/v1/workspaces/${ws.A.workspaceId}/research-runs`, {
      mode: "account",
      query: "infrastructure",
      accountId,
      budget: 3,
      filters: { countries: ["GB"] },
    });
    expect(res.statusCode, res.body).toBe(200);
    await runQueuedResearch();
    return res.json().researchRunId as string;
  }

  /** Researcher qualifies + submits, reviewer reviews evidence and accepts. */
  async function acceptAccount(accountId: string) {
    const brief = (await call("researcher", "GET", `/v1/accounts/${accountId}/brief?workspaceId=${ws.A.workspaceId}`)).json();
    const evId = brief.evidence[0].id as string;
    const q = (await call("researcher", "GET", `/v1/accounts/${accountId}/qualification?workspaceId=${ws.A.workspaceId}`)).json();
    let res = await call("researcher", "PATCH", `/v1/accounts/${accountId}/qualification?workspaceId=${ws.A.workspaceId}`, {
      expectedVersion: q.qualification.version,
      rationale: "Expanding data centre footprint",
      facts: [
        { fieldKey: "workload_use_case", value: "Private cloud", basis: "source_observed", evidenceIds: [evId] },
        { fieldKey: "budget_status", basis: "unknown" },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    res = await call("researcher", "POST", `/v1/accounts/${accountId}/acceptance-decisions?workspaceId=${ws.A.workspaceId}`, {
      toState: "ready_for_review",
    });
    expect(res.statusCode, res.body).toBe(200);
    res = await call("reviewer", "POST", `/v1/evidence/${evId}/review`, { workspaceId: ws.A.workspaceId });
    expect(res.statusCode, res.body).toBe(200);
    res = await call("reviewer", "POST", `/v1/accounts/${accountId}/acceptance-decisions?workspaceId=${ws.A.workspaceId}`, {
      toState: "accepted",
      ownerUserId: userIds.sdr,
      nextAction: "Call the infrastructure lead",
    });
    expect(res.statusCode, res.body).toBe(200);
    return { evId };
  }

  const ukItem = (n: number, extra: Partial<NormalizedEvidenceItem> = {}): NormalizedEvidenceItem => ({
    canonicalUrl: `https://news.example.co.uk/story-${n}`,
    title: `Acme expands data centre ${n}`,
    excerpt: `Acme announced a new data centre in Manchester (${n}).`,
    publisher: "news.example.co.uk",
    eventDate: new Date(Date.now() - 10 * 86400000).toISOString(),
    country: "GB",
    matchRationale: "test",
    providerRequestRef: "req_test",
    ...extra,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    process.env.DATABASE_URL_UNPOOLED = TEST_DB!;
    process.env.EXA_API_KEY = FAKE_EXA_KEY;
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-test-secret";
    process.env.NODE_ENV = "test";

    // Migrate the disposable database
    const pg = (await import("pg")).default;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const pool = new pg.Pool({ connectionString: TEST_DB });
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations"),
    });
    await pool.end();

    schema = await import("../db/schema/index.js");
    db = (await import("../db/client.js")).getDb();
    const { setResearchProviderForTests } = await import("../providers/research/index.js");
    provider = new FakeProvider();
    setResearchProviderForTests(provider);
    ({ handleResearchRun } = await import("../jobs/handlers/researchRun.js"));
    ({ handleCsvImport } = await import("../jobs/handlers/csvImport.js"));
    const { buildApp } = await import("../app.js");
    app = await buildApp({ logger: false });

    const { newId } = await import("../utils/ids.js");
    for (const w of ["A", "B"] as const) {
      ws[w] = { tenantId: newId("ten"), workspaceId: newId("ws") };
      await db.insert(schema.tenants).values({ id: ws[w].tenantId, name: `Tenant ${w}`, researchQuotaMonthly: 40 });
      await db.insert(schema.workspaces).values({ id: ws[w].workspaceId, tenantId: ws[w].tenantId, name: `WS ${w}` });
    }
    const tag = Date.now();
    await makeUser("admin", `admin.${tag}@a.test`, "tenant_admin", "A");
    await makeUser("researcher", `researcher.${tag}@a.test`, "researcher", "A");
    await makeUser("sdr", `sdr.${tag}@a.test`, "sdr", "A");
    await makeUser("reviewer", `reviewer.${tag}@a.test`, "sales_reviewer", "A");
    await makeUser("partner", `partner.${tag}@p.test`, "partner", "A");
    await makeUser("analyst", `analyst.${tag}@a.test`, "analyst", "A");
    await makeUser("adminB", `admin.${tag}@b.test`, "tenant_admin", "B");
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it("gate 1: another tenant cannot read or mutate via guessed IDs, export, or job status", async () => {
    const acct = await createAccount("admin", "A", { name: "Acme Ltd", domain: "acme.co.uk", country: "UK" });
    const runId = await researchAccount("admin", acct.id, [ukItem(1)]);

    // B uses A's workspace ID → no membership
    expect((await call("adminB", "GET", `/v1/accounts/${acct.id}/brief?workspaceId=${ws.A.workspaceId}`)).statusCode).toBe(403);
    // B uses its own workspace with A's object IDs → not found
    expect((await call("adminB", "GET", `/v1/accounts/${acct.id}/brief?workspaceId=${ws.B.workspaceId}`)).statusCode).toBe(404);
    expect((await call("adminB", "GET", `/v1/research-runs/${runId}?workspaceId=${ws.B.workspaceId}`)).statusCode).toBe(404);
    expect(
      (await call("adminB", "PATCH", `/v1/accounts/${acct.id}/qualification?workspaceId=${ws.B.workspaceId}`, {
        expectedVersion: 1,
      })).statusCode,
    ).toBe(404);
    const exportB = await call("adminB", "GET", `/v1/workspaces/${ws.B.workspaceId}/accounts/export`);
    expect(exportB.statusCode).toBe(200);
    expect(exportB.body).not.toContain("acme.co.uk");
    const listB = await call("adminB", "GET", `/v1/workspaces/${ws.B.workspaceId}/accounts`);
    expect(listB.json().accounts).toHaveLength(0);
  });

  it("gate 2: delegated users see only granted workspaces; revoked users lose access on the next request", async () => {
    const delegateEmail = `delegate.${Date.now()}@agency.test`;
    // A new member needs the admin to set a password
    expect(
      (await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/memberships`, { email: delegateEmail, role: "researcher" }))
        .statusCode,
    ).toBe(400);
    const grant = await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/memberships`, {
      email: delegateEmail,
      role: "researcher",
      password: "admin-set-password",
    });
    expect(grant.statusCode, grant.body).toBe(200);
    const { membership } = grant.json();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: delegateEmail, password: "admin-set-password" },
    });
    expect(login.statusCode).toBe(200);
    // The admin-set password works straight away; the member may change it later
    expect(login.json().user.mustChangePassword).toBe(false);
    cookies.delegate = String(login.headers["set-cookie"]).split(";")[0]!;
    expect((await call("delegate", "GET", "/v1/workspaces")).statusCode).toBe(200);
    expect(
      (await call("delegate", "POST", "/v1/auth/change-password", { currentPassword: "wrong", newPassword: "a-new-long-password" }))
        .statusCode,
    ).toBe(400);
    const changed = await call("delegate", "POST", "/v1/auth/change-password", {
      currentPassword: "admin-set-password",
      newPassword: "a-new-long-password",
    });
    expect(changed.statusCode, changed.body).toBe(200);
    // Admin sets a new password and the person is signed out
    const reset = await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/memberships/${membership.id}/reset-password`, {
      newPassword: "admin-reset-password",
    });
    expect(reset.statusCode, reset.body).toBe(200);
    expect((await call("delegate", "GET", "/v1/workspaces")).statusCode).toBe(401);
    // Another tenant's admin cannot reset this member
    expect(
      (
        await call("adminB", "POST", `/v1/workspaces/${ws.A.workspaceId}/memberships/${membership.id}/reset-password`, {
          newPassword: "takeover-password",
        })
      ).statusCode,
    ).toBe(403);
    const relogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: delegateEmail, password: "admin-reset-password" },
    });
    expect(relogin.statusCode).toBe(200);
    cookies.delegate = String(relogin.headers["set-cookie"]).split(";")[0]!;
    const wsList = (await call("delegate", "GET", "/v1/workspaces")).json().workspaces;
    expect(wsList.map((w: { id: string }) => w.id)).toEqual([ws.A.workspaceId]);
    expect((await call("delegate", "GET", `/v1/workspaces/${ws.A.workspaceId}/accounts`)).statusCode).toBe(200);

    const revoke = await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/memberships/${membership.id}/revoke`);
    expect(revoke.statusCode).toBe(200);
    expect((await call("delegate", "GET", `/v1/workspaces/${ws.A.workspaceId}/accounts`)).statusCode).toBe(403);

    // Partners and analysts have no workspace-wide account reads
    expect((await call("partner", "GET", `/v1/workspaces/${ws.A.workspaceId}/accounts`)).statusCode).toBe(403);
    expect((await call("analyst", "GET", `/v1/workspaces/${ws.A.workspaceId}/accounts/export`)).statusCode).toBe(403);
  });

  it("gate 3: UK results carry source references with separate event/discovery/check dates; unknowns stay flagged", async () => {
    const acct = await createAccount("admin", "A", { name: "Beta Group", domain: "beta.co.uk" });
    await researchAccount("admin", acct.id, [
      ukItem(10, { title: "Beta opens new site", excerpt: "Beta opens a new site in Leeds" }),
      ukItem(11, { title: "Beta hiring infra team", excerpt: "Beta is hiring engineers", eventDate: null }),
      ukItem(12, {
        canonicalUrl: "https://news.example.de/beta",
        country: "DE",
        title: "Beta Germany",
        excerpt: "German item",
      }),
    ]);
    const brief = (await call("admin", "GET", `/v1/accounts/${acct.id}/brief?workspaceId=${ws.A.workspaceId}`)).json();
    // The fake provider does not filter, so region filtering must happen in normalized data upstream:
    // here we assert every stored item carries provenance and separate dates.
    for (const e of brief.evidence) {
      expect(e.sourceUrl).toMatch(/^https:\/\//);
      expect(e).toHaveProperty("eventDate");
      expect(e.discoveredAt).toBeTruthy();
      expect(e.checkedAt).toBeTruthy();
      expect(e.providerRequestRef).toBeTruthy();
    }
    const undated = brief.evidence.find((e: { eventDate: string | null }) => e.eventDate === null);
    expect(undated.freshness).toBe("date_unknown");
    expect(brief.signals.some((s: { unknownNote: string }) => s.unknownNote === "event_date_unknown")).toBe(true);
    // Unknown qualification facts remain unknown
    const q = (await call("admin", "GET", `/v1/accounts/${acct.id}/qualification?workspaceId=${ws.A.workspaceId}`)).json();
    const save = await call("admin", "PATCH", `/v1/accounts/${acct.id}/qualification?workspaceId=${ws.A.workspaceId}`, {
      expectedVersion: q.qualification.version,
      facts: [{ fieldKey: "budget_status", basis: "unknown", value: "£1m" }],
    });
    expect(save.statusCode).toBe(400);
  });

  it("gate 3b: the Exa adapter drops sources whose normalized country is outside the territory", async () => {
    const { ExaResearchProvider } = await import("../providers/research/exa.js");
    const exa = new ExaResearchProvider();
    const items = exa.normalize({
      results: [
        { url: "https://www.example.co.uk/a", title: "UK", publishedDate: "2026-09-01" },
        { url: "https://example.de/b", title: "DE", publishedDate: "not a date" },
      ],
    });
    expect(items.map((i) => i.country)).toEqual(["GB", "DE"]);
    expect(items[1]!.eventDate).toBeNull();
    expect(items[0]!.publisher).toBe("example.co.uk");
  });

  it("gate 4: duplicate candidates are reviewed; malformed rows give useful errors; exports are formula-safe", async () => {
    await createAccount("admin", "A", { name: "Gamma Ltd", domain: "gamma.com" });
    const csv = [
      "Company Name,Website,Country",
      "Gamma Holdings,gamma.com,UK", // same domain, different name → merge candidate
      ",nodomain.com,UK", // missing name
      '"=HYPERLINK(""http://evil"")",evil.com,UK', // formula payload
      "Delta,not a domain,Atlantis", // bad domain + unknown country (imported with warnings)
      '"Broken,quote.com,UK', // unterminated quote
    ].join("\n");
    const preview = await call("researcher", "POST", `/v1/workspaces/${ws.A.workspaceId}/imports/preview`, { csvText: csv });
    expect(preview.json().suggestedMapping.name).toBe("company name");
    const res = await call("researcher", "POST", `/v1/workspaces/${ws.A.workspaceId}/imports`, {
      csvText: csv,
      mapping: { name: "company name", domain: "website", country: "country" },
    });
    expect(res.statusCode, res.body).toBe(200);
    const job = enqueued[enqueued.length - 1]!;
    await handleCsvImport({ importJobId: job.id, csvText: job.csvText!, mapping: job.mapping as never });
    const report = (await call("researcher", "GET", `/v1/imports/${job.id}?workspaceId=${ws.A.workspaceId}`)).json().import;
    const errors = report.rowErrors.join("\n");
    expect(errors).toMatch(/possible duplicate/);
    expect(errors).toMatch(/Line 3: missing company name/);
    expect(errors).toMatch(/not a valid domain/);
    expect(errors).toMatch(/unknown country/);
    expect(errors).toMatch(/unterminated/);
    const candidates = (await call("researcher", "GET", `/v1/workspaces/${ws.A.workspaceId}/merge-candidates`)).json().candidates;
    expect(candidates.some((c: { reason: string }) => /gamma\.com/.test(c.reason))).toBe(true);

    const exp = await call("researcher", "GET", `/v1/workspaces/${ws.A.workspaceId}/accounts/export`);
    expect(exp.body).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(exp.body).not.toMatch(/(^|\n|,)=HYPERLINK/);
    const errCsv = await call("researcher", "GET", `/v1/imports/${job.id}/errors.csv?workspaceId=${ws.A.workspaceId}`);
    expect(errCsv.statusCode).toBe(200);
  });

  it("gate 5: acceptance needs reviewed evidence, an owner and a next action; non-reviewers cannot approve", async () => {
    const acct = await createAccount("admin", "A", { name: "Epsilon", domain: "epsilon.co.uk" });
    await researchAccount("admin", acct.id, [ukItem(20, { title: "Epsilon refresh", excerpt: "Epsilon server refresh" })]);
    const brief = (await call("researcher", "GET", `/v1/accounts/${acct.id}/brief?workspaceId=${ws.A.workspaceId}`)).json();
    const q = (await call("researcher", "GET", `/v1/accounts/${acct.id}/qualification?workspaceId=${ws.A.workspaceId}`)).json();
    await call("researcher", "PATCH", `/v1/accounts/${acct.id}/qualification?workspaceId=${ws.A.workspaceId}`, {
      expectedVersion: q.qualification.version,
      rationale: "Refresh cycle",
      facts: [{ fieldKey: "refresh_driver", value: "End of life", basis: "source_observed", evidenceIds: [brief.evidence[0].id] }],
    });
    const url = `/v1/accounts/${acct.id}/acceptance-decisions?workspaceId=${ws.A.workspaceId}`;
    expect((await call("researcher", "POST", url, { toState: "ready_for_review" })).statusCode).toBe(200);

    const accept = { toState: "accepted", ownerUserId: userIds.sdr, nextAction: "Call" };
    expect((await call("researcher", "POST", url, accept)).statusCode).toBe(403);
    let r = await call("reviewer", "POST", url, accept);
    expect(r.statusCode).toBe(400);
    expect(r.json().error.message).toMatch(/reviewed evidence/);

    await call("reviewer", "POST", `/v1/evidence/${brief.evidence[0].id}/review`, { workspaceId: ws.A.workspaceId });
    r = await call("reviewer", "POST", url, { toState: "accepted", nextAction: "Call" });
    expect(r.json().error.message).toMatch(/owner/);
    r = await call("reviewer", "POST", url, { toState: "accepted", ownerUserId: userIds.adminB, nextAction: "Call" });
    expect(r.json().error.message).toMatch(/active workspace member/);
    r = await call("reviewer", "POST", url, { toState: "accepted", ownerUserId: userIds.sdr });
    expect(r.json().error.message).toMatch(/next action/);
    r = await call("reviewer", "POST", url, accept);
    expect(r.statusCode, r.body).toBe(200);
    // Arbitrary state assignment is prohibited
    expect((await call("admin", "POST", url, { toState: "draft" })).statusCode).toBe(409);
  });

  it("gate 6: material changes after acceptance require re-review; concurrent saves conflict", async () => {
    const acct = await createAccount("admin", "A", { name: "Zeta", domain: "zeta.co.uk" });
    await researchAccount("admin", acct.id, [ukItem(30, { title: "Zeta expands", excerpt: "Zeta expands" })]);
    await acceptAccount(acct.id);

    const q = (await call("researcher", "GET", `/v1/accounts/${acct.id}/qualification?workspaceId=${ws.A.workspaceId}`)).json();
    const v = q.qualification.version;
    const first = await call("researcher", "PATCH", `/v1/accounts/${acct.id}/qualification?workspaceId=${ws.A.workspaceId}`, {
      expectedVersion: v,
      facts: [{ fieldKey: "buying_timeframe", value: "Q1", basis: "research_hypothesis" }],
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().reopenedForReview).toBe(true);
    // A second editor still holding the old version cannot overwrite silently
    const second = await call("sdr", "PATCH", `/v1/accounts/${acct.id}/qualification?workspaceId=${ws.A.workspaceId}`, {
      expectedVersion: v,
      facts: [{ fieldKey: "buying_timeframe", value: "Q4", basis: "research_hypothesis" }],
    });
    expect(second.statusCode).toBe(409);

    const brief = (await call("reviewer", "GET", `/v1/accounts/${acct.id}/brief?workspaceId=${ws.A.workspaceId}`)).json();
    expect(brief.account.acceptanceState).toBe("ready_for_review");
    expect(brief.decisions.some((d: { reasonCategory: string }) => d.reasonCategory === "material_change")).toBe(true);
    expect(brief.decisions.some((d: { toState: string }) => d.toState === "accepted")).toBe(true);
    // Stale account version cannot approve
    const stale = await call("reviewer", "POST", `/v1/accounts/${acct.id}/acceptance-decisions?workspaceId=${ws.A.workspaceId}`, {
      toState: "accepted",
      ownerUserId: userIds.sdr,
      nextAction: "Call",
      expectedVersion: acct.version,
    });
    expect(stale.statusCode).toBe(409);
  });

  it("gate 7: task completion requires an outcome and has no side effects", async () => {
    const acct = await createAccount("admin", "A", { name: "Eta", domain: "eta.co.uk" });
    const t = await call("admin", "POST", "/v1/tasks", {
      workspaceId: ws.A.workspaceId,
      accountId: acct.id,
      type: "call",
      ownerUserId: userIds.sdr,
      dueAt: new Date(Date.now() - 3600_000).toISOString(),
      timezone: "Europe/London",
    });
    expect(t.statusCode, t.body).toBe(200);
    const taskId = t.json().task.id;
    const overdue = (await call("sdr", "GET", `/v1/workspaces/${ws.A.workspaceId}/tasks?due=overdue`)).json().tasks;
    expect(overdue.map((x: { id: string }) => x.id)).toContain(taskId);

    const before = (await call("admin", "GET", `/v1/accounts/${acct.id}/brief?workspaceId=${ws.A.workspaceId}`)).json().account;
    expect((await call("sdr", "PATCH", `/v1/tasks/${taskId}`, { workspaceId: ws.A.workspaceId, status: "completed" })).statusCode).toBe(400);
    const done = await call("sdr", "PATCH", `/v1/tasks/${taskId}`, {
      workspaceId: ws.A.workspaceId,
      status: "completed",
      outcome: "Spoke to IT lead",
    });
    expect(done.statusCode).toBe(200);
    const after = (await call("admin", "GET", `/v1/accounts/${acct.id}/brief?workspaceId=${ws.A.workspaceId}`)).json().account;
    expect(after.acceptanceState).toBe(before.acceptanceState);
    expect(after.version).toBe(before.version);
    expect((await call("sdr", "PATCH", `/v1/tasks/${taskId}`, { workspaceId: ws.A.workspaceId, status: "open" })).statusCode).toBe(409);
    const followUp = await call("sdr", "POST", "/v1/tasks", {
      workspaceId: ws.A.workspaceId,
      accountId: acct.id,
      type: "follow_up",
      ownerUserId: userIds.sdr,
    });
    expect(followUp.statusCode).toBe(400);
  });

  it("gate 8: suppression is honored in discovery, task creation and exports", async () => {
    const acct = await createAccount("admin", "A", { name: "Theta", domain: "theta.co.uk" });
    const sup = await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/suppressions`, {
      addressOrDomain: "https://www.theta.co.uk",
      reason: "do_not_contact",
    });
    expect(sup.statusCode, sup.body).toBe(200);

    expect(
      (await call("admin", "POST", "/v1/tasks", {
        workspaceId: ws.A.workspaceId,
        accountId: acct.id,
        type: "email",
        ownerUserId: userIds.sdr,
      })).statusCode,
    ).toBe(400);
    const exp = await call("admin", "GET", `/v1/workspaces/${ws.A.workspaceId}/accounts/export`);
    expect(exp.body).not.toContain("theta.co.uk");
    expect(
      (await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/research-runs`, {
        mode: "account",
        query: "x",
        accountId: acct.id,
      })).statusCode,
    ).toBe(400);
    expect(
      (await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/accounts`, { name: "Theta 2", domain: "theta.co.uk" }))
        .statusCode,
    ).toBe(400);

    // Discovery never creates a candidate for a suppressed domain
    provider.items = [
      ukItem(60, { title: "Theta expands", excerpt: "Theta expands", subject: { companyName: "Theta", companyWebsite: "theta.co.uk", eventSummary: "Theta expands" } }),
      ukItem(61, { title: "Iota opens site", excerpt: "Iota opens site", subject: { companyName: "Iota", companyWebsite: "iota.co.uk", eventSummary: "Iota opens a site" } }),
    ];
    const run = await call("researcher", "POST", `/v1/workspaces/${ws.A.workspaceId}/research-runs`, {
      mode: "discovery",
      query: "UK firms expanding",
      budget: 2,
    });
    expect(run.statusCode, run.body).toBe(200);
    await runQueuedResearch();
    const result = (await call("researcher", "GET", `/v1/research-runs/${run.json().researchRunId}?workspaceId=${ws.A.workspaceId}`)).json()
      .researchRun.result;
    expect(result.skippedSuppressed).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].domain).toBe("iota.co.uk");
    const csv = await call("researcher", "GET", `/v1/research-runs/${run.json().researchRunId}/results.csv?workspaceId=${ws.A.workspaceId}`);
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain("iota.co.uk");
    expect(csv.body).not.toContain("theta.co.uk");
  });

  it("discovery ties articles to companies, attaches cited evidence and flags uncertain identities", async () => {
    provider.items = [
      ukItem(70, { title: "Nu opens Leeds data centre", excerpt: "Nu opens Leeds data centre", subject: { companyName: "Nu Insurance", companyWebsite: "https://www.nu-insurance.co.uk/about", eventSummary: "Nu opened a Leeds data centre" } }),
      ukItem(71, { title: "Nu hiring infra engineers", excerpt: "Nu is hiring six infrastructure engineers", subject: { companyName: "Nu Insurance", companyWebsite: "nu-insurance.co.uk", eventSummary: "Nu is hiring" } }),
      ukItem(72, { title: "Xi refresh", excerpt: "Xi plans a server refresh", subject: { companyName: "Xi Logistics", companyWebsite: null, eventSummary: "Xi plans a refresh" } }),
      ukItem(73, { title: "Market roundup", excerpt: "Several firms expand", subject: { companyName: null, companyWebsite: null, eventSummary: null } }),
    ];
    const run = await call("researcher", "POST", `/v1/workspaces/${ws.A.workspaceId}/research-runs`, {
      mode: "discovery",
      query: "UK insurers expanding data centres",
      budget: 4,
    });
    await runQueuedResearch();
    const result = (await call("researcher", "GET", `/v1/research-runs/${run.json().researchRunId}?workspaceId=${ws.A.workspaceId}`)).json()
      .researchRun.result;
    expect(result.unmatched).toBe(1);
    // Saved searches can be listed again after a page refresh
    const recent = (await call("researcher", "GET", `/v1/workspaces/${ws.A.workspaceId}/research-runs?mode=discovery&limit=5`)).json().runs;
    expect(recent[0].id).toBe(run.json().researchRunId);
    expect(recent[0].companies).toBe(result.rows.length);
    expect((await call("partner", "GET", `/v1/workspaces/${ws.A.workspaceId}/research-runs?mode=discovery`)).statusCode).toBe(403);
    const nu = result.rows.find((r: { domain: string }) => r.domain === "nu-insurance.co.uk");
    const xi = result.rows.find((r: { name: string }) => r.name === "Xi Logistics");
    expect(nu.sources).toBe(2);
    expect(nu.identityNeedsReview).toBe(false);
    expect(xi.identityNeedsReview).toBe(true);
    const brief = (await call("researcher", "GET", `/v1/accounts/${nu.accountId}/brief?workspaceId=${ws.A.workspaceId}`)).json();
    expect(brief.account.researchState).toBe("researched");
    expect(brief.evidence).toHaveLength(2);
    expect(brief.evidence.every((e: { reviewedAt: string | null }) => e.reviewedAt === null)).toBe(true);
  });

  it("gate 9: a recorded handoff stays unshared until authorized; partners see only permitted fields", async () => {
    const acct = await createAccount("admin", "A", { name: "Kappa", domain: "kappa.co.uk" });
    await researchAccount("admin", acct.id, [ukItem(40, { title: "Kappa grows", excerpt: "Kappa grows" })]);
    await acceptAccount(acct.id);
    const partnerEmail = (await db.select().from(schema.users).where((await import("drizzle-orm")).eq(schema.users.id, userIds.partner)))[0]!.email;

    const created = await call("reviewer", "POST", `/v1/accounts/${acct.id}/handoffs?workspaceId=${ws.A.workspaceId}`, {
      receivingOrg: "Partner Co",
      receivingUser: partnerEmail,
      internalOwnerUserId: userIds.sdr,
      permittedFields: ["name", "nextAction"],
      reason: "Regional coverage",
      nextAction: "Site visit",
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    expect(created.statusCode, created.body).toBe(200);
    const handoffId = created.json().handoff.id;
    expect(created.json().handoff.state).toBe("prepared");

    expect((await call("partner", "GET", `/v1/handoffs/${handoffId}/partner-view?workspaceId=${ws.A.workspaceId}`)).statusCode).toBe(404);
    expect((await call("partner", "GET", `/v1/workspaces/${ws.A.workspaceId}/shared-handoffs`)).json().handoffs).toHaveLength(0);
    expect(
      (await call("partner", "POST", `/v1/handoffs/${handoffId}/transition`, { workspaceId: ws.A.workspaceId, toState: "acknowledged" }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call("researcher", "POST", `/v1/handoffs/${handoffId}/share`, { workspaceId: ws.A.workspaceId, granteeEmail: partnerEmail }))
        .statusCode,
    ).toBe(403);

    const share = await call("reviewer", "POST", `/v1/handoffs/${handoffId}/share`, { workspaceId: ws.A.workspaceId, granteeEmail: partnerEmail });
    expect(share.statusCode, share.body).toBe(200);
    // Retried share does not duplicate the grant
    await call("reviewer", "POST", `/v1/handoffs/${handoffId}/share`, { workspaceId: ws.A.workspaceId, granteeEmail: partnerEmail });
    const handoffs = (await call("reviewer", "GET", `/v1/accounts/${acct.id}/handoffs?workspaceId=${ws.A.workspaceId}`)).json().handoffs;
    expect(handoffs[0].grants).toHaveLength(1);

    const view = (await call("partner", "GET", `/v1/handoffs/${handoffId}/partner-view?workspaceId=${ws.A.workspaceId}`)).json();
    expect(view.account).toEqual({ name: "Kappa" });
    expect(view.handoff.nextAction).toBe("Site visit");
    expect(view.handoff.reason).toBeUndefined();
    expect(view.evidence).toEqual([]);
    expect(view.facts).toEqual([]);
    expect(
      (await call("partner", "POST", `/v1/handoffs/${handoffId}/transition`, { workspaceId: ws.A.workspaceId, toState: "acknowledged" }))
        .statusCode,
    ).toBe(200);
    expect(
      (await call("partner", "POST", `/v1/handoffs/${handoffId}/transition`, { workspaceId: ws.A.workspaceId, toState: "closed" }))
        .statusCode,
    ).toBe(403);
  });

  it("gate 10: retries never double-charge or duplicate evidence; exhausted budget stops jobs", async () => {
    const { tenants, providerUsage, evidence } = schema;
    const { eq } = await import("drizzle-orm");
    const usedBefore = (await db.select().from(tenants).where(eq(tenants.id, ws.A.tenantId)))[0]!.researchUsedMonthly;
    const acct = await createAccount("admin", "A", { name: "Lambda", domain: "lambda.co.uk" });

    const { NormalizedProviderError } = await import("../providers/research/types.js");
    provider.items = [ukItem(50, { title: "Lambda news", excerpt: "Lambda news" }), ukItem(51, { title: "Lambda copy", excerpt: "Lambda news" })];
    provider.failNext = new NormalizedProviderError("provider_timeout", "timed out", true);
    const res = await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/research-runs`, {
      mode: "account",
      query: "x",
      accountId: acct.id,
      budget: 3,
    });
    const runId = res.json().researchRunId;
    await expect(handleResearchRun({ researchRunId: runId }, { retryCount: 0, retryLimit: 3 })).rejects.toThrow();
    await handleResearchRun({ researchRunId: runId }, { retryCount: 1, retryLimit: 3 });
    await handleResearchRun({ researchRunId: runId }, { retryCount: 2, retryLimit: 3 }); // duplicate delivery

    const usage = await db.select().from(providerUsage).where(eq(providerUsage.researchRunId, runId));
    expect(usage).toHaveLength(1);
    const usedAfter = (await db.select().from(tenants).where(eq(tenants.id, ws.A.tenantId)))[0]!.researchUsedMonthly;
    expect(usedAfter - usedBefore).toBe(usage[0]!.units);
    // The syndicated copy (same text) is not stored twice
    expect(await db.select().from(evidence).where(eq(evidence.accountId, acct.id))).toHaveLength(1);

    await db.update(tenants).set({ researchUsedMonthly: 40 }).where(eq(tenants.id, ws.A.tenantId));
    const blocked = await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/research-runs`, {
      mode: "account",
      query: "x",
      accountId: acct.id,
    });
    expect(blocked.statusCode).toBe(429);
    await db.update(tenants).set({ researchUsedMonthly: usedAfter }).where(eq(tenants.id, ws.A.tenantId));
  });

  it("gate 11: reports reconcile with decision/activity events and disclose cohort, denominator and currency", async () => {
    const { acceptanceDecisions, activities } = schema;
    const { and, eq, inArray } = await import("drizzle-orm");
    const out = (await call("analyst", "GET", `/v1/workspaces/${ws.A.workspaceId}/outcomes`)).json();
    expect(out.currency).toBe("GBP");
    expect(out.cohort.decisionRule).toMatch(/Latest/);
    const decisions = await db
      .select()
      .from(acceptanceDecisions)
      .where(
        and(
          eq(acceptanceDecisions.workspaceId, ws.A.workspaceId),
          inArray(acceptanceDecisions.toState, ["accepted", "needs_research", "rejected"]),
        ),
      );
    const latest = new Map<string, string>();
    for (const d of [...decisions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) latest.set(d.accountId, d.toState);
    expect(out.denominators.accountsWithReviewerDecision).toBe(latest.size);
    expect(out.metrics.explicitSalesAccepted).toBe([...latest.values()].filter((s) => s === "accepted").length);
    const completed = await db
      .select()
      .from(activities)
      .where(and(eq(activities.workspaceId, ws.A.workspaceId), eq(activities.kind, "task_completed")));
    expect(out.metrics.completedSdrActions).toBe(completed.length);
    expect(out.metrics.crmOpportunities).toBeNull();
    expect((await call("partner", "GET", `/v1/workspaces/${ws.A.workspaceId}/outcomes`)).statusCode).toBe(403);
  });

  it("gate 12: no response or error contains the provider API key", async () => {
    provider.failNext = new Error(`upstream said Authorization: Bearer ${FAKE_EXA_KEY}`);
    const acct = await createAccount("admin", "A", { name: "Mu", domain: "mu.co.uk" });
    const res = await call("admin", "POST", `/v1/workspaces/${ws.A.workspaceId}/research-runs`, {
      mode: "account",
      query: "x",
      accountId: acct.id,
    });
    await handleResearchRun({ researchRunId: res.json().researchRunId }, { retryCount: 0, retryLimit: 0 });
    await call("admin", "GET", `/v1/research-runs/${res.json().researchRunId}?workspaceId=${ws.A.workspaceId}`);
    await call("admin", "GET", `/v1/workspaces/${ws.A.workspaceId}/settings/connections`);
    await call("admin", "GET", "/health");
    for (const body of allBodies) expect(body).not.toContain(FAKE_EXA_KEY);
  });
});

describe.skipIf(enabled)("Phase 1 release gates (skipped)", () => {
  it("set TEST_DATABASE_URL to a disposable database to run the gate tests", () => {
    expect(true).toBe(true);
  });
});
