import { describe, expect, it } from "vitest";
import { HubspotCrmProvider } from "./hubspot.js";
import { CrmError } from "./types.js";

const TOKEN = "pat-na2-test-token-never-leaks-0000";

/** Scripted fetch: returns queued responses in order and records each request. */
function fakeFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; method: string; body: unknown; auth: string | null }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get("authorization"),
    });
    const next = responses.shift() ?? { status: 500 };
    return new Response(next.body === undefined ? "" : JSON.stringify(next.body), {
      status: next.status,
      headers: next.headers,
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const make = (f: ReturnType<typeof fakeFetch>) => new HubspotCrmProvider(TOKEN, "247836797", f.impl, async () => undefined);

describe("HubspotCrmProvider", () => {
  it("creates a company with only non-empty fields and the bearer token", async () => {
    const f = fakeFetch([{ status: 201, body: { id: "c1" } }]);
    const id = await make(f).createCompany({ name: "Acme", domain: "acme.co.uk", country: null });
    expect(id).toBe("c1");
    expect(f.calls[0]).toMatchObject({
      url: "https://api.hubapi.com/crm/v3/objects/companies",
      method: "POST",
      body: { properties: { name: "Acme", domain: "acme.co.uk" } },
      auth: `Bearer ${TOKEN}`,
    });
  });

  it("finds an existing company by domain so a first sync links instead of duplicating", async () => {
    const f = fakeFetch([{ status: 200, body: { results: [{ id: "c9" }] } }]);
    expect(await make(f).findCompanyByDomain("acme.co.uk")).toBe("c9");
    expect(f.calls[0]!.body).toMatchObject({
      filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: "acme.co.uk" }] }],
    });
  });

  it("maps a deal with stage, pipeline, amount and a non-primary currency", async () => {
    const f = fakeFetch([
      { status: 200, body: { companyCurrency: "USD", additionalCurrencies: ["GBP"] } },
      { status: 201, body: { id: "d1" } },
    ]);
    await make(f).createDeal({ name: "Acme deal", stageId: "closedwon", pipelineId: "default", amount: 300000, currency: "GBP" });
    expect(f.calls[1]!.body).toEqual({
      properties: { dealname: "Acme deal", pipeline: "default", dealstage: "closedwon", amount: "300000", deal_currency_code: "GBP" },
    });
  });

  it("omits the currency code for the account's primary currency", async () => {
    const f = fakeFetch([{ status: 200, body: { companyCurrency: "USD", additionalCurrencies: [] } }, { status: 201, body: { id: "d2" } }]);
    const crm = make(f);
    await crm.createDeal({ name: "x", stageId: "s", pipelineId: "default", amount: 5, currency: "USD" });
    expect(f.calls[1]!.body).toEqual({ properties: { dealname: "x", pipeline: "default", dealstage: "s", amount: "5" } });
    expect(await crm.currencies()).toEqual({ primary: "USD", all: ["USD"] });
    expect(f.calls).toHaveLength(2);
  });

  it("retries rate limits and server errors, then succeeds", async () => {
    const f = fakeFetch([{ status: 429, headers: { "retry-after": "1" } }, { status: 503 }, { status: 201, body: { id: "c2" } }]);
    expect(await make(f).createCompany({ name: "Acme", domain: null, country: null })).toBe("c2");
    expect(f.calls).toHaveLength(3);
  });

  it("gives up after bounded retries with a retryable error", async () => {
    const f = fakeFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
    await expect(make(f).createCompany({ name: "Acme", domain: null, country: null })).rejects.toMatchObject({
      status: 500,
      retryable: true,
    });
    expect(f.calls).toHaveLength(3);
  });

  it("explains auth and scope failures without leaking the token", async () => {
    const f = fakeFetch([
      { status: 200, body: { companyCurrency: "GBP" } },
      { status: 403, body: { message: `Missing scopes for token ${TOKEN}` } },
    ]);
    const err = (await make(f)
      .createDeal({ name: "x", stageId: "s", pipelineId: "default", amount: null, currency: "GBP" })
      .catch((e: unknown) => e)) as CrmError;
    expect(err).toBeInstanceOf(CrmError);
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/missing a required scope/);
    expect(err.message).not.toContain(TOKEN);
  });

  it("treats a missing record as not found instead of an error", async () => {
    const f = fakeFetch([{ status: 404 }]);
    expect(await make(f).exists("deal", "gone")).toBe(false);
  });

  it("reads a deal's stage and amount back", async () => {
    const f = fakeFetch([
      { status: 200, body: { id: "d1", properties: { dealstage: "contractsent", amount: "1250.4", deal_currency_code: "GBP" }, updatedAt: "2026-10-30T10:00:00Z" } },
    ]);
    expect(await make(f).getDeal("d1")).toEqual({ id: "d1", stageId: "contractsent", amount: 1250, currency: "GBP", updatedAt: "2026-10-30T10:00:00Z" });
  });

  it("builds a link into HubSpot's UI from the portal id", () => {
    expect(make(fakeFetch([])).recordUrl("deal", "d1")).toBe("https://app.hubspot.com/contacts/247836797/record/0-3/d1");
  });
});
