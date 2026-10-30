import { getEnv } from "../../config/env.js";
import { redactString } from "../../utils/redact.js";
import {
  CrmError,
  type CrmCompanyInput,
  type CrmContactInput,
  type CrmDeal,
  type CrmDealInput,
  type CrmDealStage,
  type CrmObjectType,
  type CrmProvider,
} from "./types.js";

const BASE = "https://api.hubapi.com";
const OBJECT: Record<CrmObjectType, string> = { company: "companies", contact: "contacts", deal: "deals" };
// HubSpot's URL segment for each object type in its web UI
const UI_TYPE: Record<CrmObjectType, string> = { company: "0-2", contact: "0-1", deal: "0-3" };
const MAX_ATTEMPTS = 3;

type Fetch = typeof fetch;

/** HubSpot CRM v3 adapter. Uses a private-app / service-key token from server env only. */
export class HubspotCrmProvider implements CrmProvider {
  readonly name = "hubspot";

  constructor(
    private readonly token = getEnv().HUBSPOT_ACCESS_TOKEN,
    private readonly portalId = getEnv().HUBSPOT_PORTAL_ID,
    private readonly fetchImpl: Fetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** One request with bounded retries on rate limits and server errors (jittered backoff). */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${BASE}${path}`, {
          method,
          headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
          await this.sleep(400 * 2 ** attempt + Math.random() * 200);
          continue;
        }
        throw new CrmError(`HubSpot could not be reached: ${redactString((err as Error).message)}`, null, true);
      }
      if (res.status === 404) return null;
      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : null) as T | null;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.sleep(retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt + Math.random() * 200);
        continue;
      }
      throw new CrmError(await describeError(res), res.status, retryable);
    }
  }

  private async findOne(type: CrmObjectType, property: string, value: string) {
    const res = await this.request<{ results: Array<{ id: string }> }>("POST", `/crm/v3/objects/${OBJECT[type]}/search`, {
      filterGroups: [{ filters: [{ propertyName: property, operator: "EQ", value }] }],
      properties: ["hs_object_id"],
      limit: 1,
    });
    return res?.results[0]?.id ?? null;
  }

  private async create(type: CrmObjectType, properties: Record<string, string>) {
    const res = await this.request<{ id: string }>("POST", `/crm/v3/objects/${OBJECT[type]}`, { properties });
    if (!res?.id) throw new CrmError(`HubSpot did not return an id for the new ${type}`, null, false);
    return res.id;
  }

  private async update(type: CrmObjectType, id: string, properties: Record<string, string>) {
    const res = await this.request("PATCH", `/crm/v3/objects/${OBJECT[type]}/${id}`, { properties });
    if (res === null) throw new CrmError(`The ${type} no longer exists in HubSpot`, 404, false);
  }

  findCompanyByDomain(domain: string) {
    return this.findOne("company", "domain", domain);
  }

  findContactByEmail(email: string) {
    return this.findOne("contact", "email", email);
  }

  createCompany(c: CrmCompanyInput) {
    return this.create("company", companyProps(c));
  }

  updateCompany(id: string, c: CrmCompanyInput) {
    return this.update("company", id, companyProps(c));
  }

  createContact(c: CrmContactInput) {
    return this.create("contact", contactProps(c));
  }

  updateContact(id: string, c: CrmContactInput) {
    return this.update("contact", id, contactProps(c));
  }

  async createDeal(d: CrmDealInput) {
    return this.create("deal", dealProps(d, (await this.currencies()).primary));
  }

  async updateDeal(id: string, d: CrmDealInput) {
    return this.update("deal", id, dealProps(d, (await this.currencies()).primary));
  }

  private currencyCache: { primary: string; all: string[] } | null = null;

  async currencies() {
    if (this.currencyCache) return this.currencyCache;
    const res = await this.request<{ companyCurrency?: string; additionalCurrencies?: string[] }>("GET", "/account-info/v3/details");
    const primary = res?.companyCurrency ?? "USD";
    this.currencyCache = { primary, all: [primary, ...(res?.additionalCurrencies ?? [])] };
    return this.currencyCache;
  }

  async associate(from: CrmObjectType, fromId: string, to: CrmObjectType, toId: string) {
    await this.request("PUT", `/crm/v4/objects/${OBJECT[from]}/${fromId}/associations/default/${OBJECT[to]}/${toId}`);
  }

  async exists(type: CrmObjectType, id: string) {
    return (await this.request("GET", `/crm/v3/objects/${OBJECT[type]}/${id}?properties=hs_object_id`)) !== null;
  }

  async getDeal(id: string): Promise<CrmDeal | null> {
    const res = await this.request<{ id: string; properties: Record<string, string | null>; updatedAt?: string }>(
      "GET",
      `/crm/v3/objects/deals/${id}?properties=dealstage,amount,deal_currency_code`,
    );
    if (!res) return null;
    const amount = res.properties.amount != null && res.properties.amount !== "" ? Number(res.properties.amount) : null;
    return {
      id: res.id,
      stageId: res.properties.dealstage ?? null,
      amount: amount != null && Number.isFinite(amount) ? Math.round(amount) : null,
      currency: res.properties.deal_currency_code ?? null,
      updatedAt: res.updatedAt ?? null,
    };
  }

  async listDealStages(): Promise<CrmDealStage[]> {
    const res = await this.request<{
      results: Array<{ id: string; stages: Array<{ id: string; label: string; metadata?: { isClosed?: string } }> }>;
    }>("GET", "/crm/v3/pipelines/deals");
    return (res?.results ?? []).flatMap((p) =>
      p.stages.map((s) => ({ id: s.id, label: s.label, pipelineId: p.id, isClosed: s.metadata?.isClosed === "true" })),
    );
  }

  recordUrl(type: CrmObjectType, id: string) {
    return this.portalId ? `https://app.hubspot.com/contacts/${this.portalId}/record/${UI_TYPE[type]}/${id}` : null;
  }
}

/** Only send fields we know; empty values are omitted so we never blank out data owned in the CRM. */
function compact(props: Record<string, string | null | undefined>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) if (v != null && v !== "") out[k] = v;
  return out;
}

function companyProps(c: CrmCompanyInput) {
  return compact({ name: c.name, domain: c.domain, country: c.country });
}

function contactProps(c: CrmContactInput) {
  return compact({ firstname: c.firstName, lastname: c.lastName, email: c.email, phone: c.phone, jobtitle: c.jobTitle });
}

/** The currency code is only sent for a non-primary currency; single-currency accounts reject it. */
function dealProps(d: CrmDealInput, primaryCurrency: string) {
  return compact({
    dealname: d.name,
    pipeline: d.pipelineId,
    dealstage: d.stageId,
    amount: d.amount != null ? String(d.amount) : null,
    deal_currency_code: d.currency === primaryCurrency ? null : d.currency,
  });
}

/** Readable, secret-free error text from a HubSpot error response. */
async function describeError(res: Response) {
  let detail = "";
  try {
    const j = (await res.json()) as { message?: string; category?: string };
    detail = j.message ?? j.category ?? "";
  } catch {
    /* non-JSON body */
  }
  const prefix =
    res.status === 401
      ? "HubSpot rejected the access token"
      : res.status === 403
        ? "The HubSpot token is missing a required scope"
        : res.status === 429
          ? "HubSpot rate limit reached"
          : `HubSpot error ${res.status}`;
  return redactString(detail ? `${prefix}: ${detail}` : prefix).slice(0, 500);
}
