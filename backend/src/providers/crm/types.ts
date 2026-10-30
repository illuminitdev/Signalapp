/**
 * Provider-neutral CRM adapter (spec R8: "CRM integration behind an adapter"). HubSpot is the
 * first implementation; another CRM is a new class implementing this interface, nothing else.
 */

export type CrmObjectType = "company" | "contact" | "deal";

export type CrmCompanyInput = { name: string; domain: string | null; country: string | null };
export type CrmContactInput = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
};
export type CrmDealInput = {
  name: string;
  /** Provider stage id, already mapped from our opportunity stage */
  stageId: string;
  pipelineId: string;
  amount: number | null;
  currency: string;
};

export type CrmDealStage = { id: string; label: string; pipelineId: string; isClosed: boolean };

export type CrmDeal = { id: string; stageId: string | null; amount: number | null; currency: string | null; updatedAt: string | null };

export interface CrmProvider {
  readonly name: string;
  /** Find an existing object so a first sync links to it instead of creating a duplicate */
  findCompanyByDomain(domain: string): Promise<string | null>;
  findContactByEmail(email: string): Promise<string | null>;
  createCompany(input: CrmCompanyInput): Promise<string>;
  updateCompany(id: string, input: CrmCompanyInput): Promise<void>;
  createContact(input: CrmContactInput): Promise<string>;
  updateContact(id: string, input: CrmContactInput): Promise<void>;
  createDeal(input: CrmDealInput): Promise<string>;
  updateDeal(id: string, input: CrmDealInput): Promise<void>;
  /** Idempotent: associating twice is a no-op */
  associate(from: CrmObjectType, fromId: string, to: CrmObjectType, toId: string): Promise<void>;
  /** Does the object still exist? A deleted CRM record is re-created rather than silently lost */
  exists(type: CrmObjectType, id: string): Promise<boolean>;
  getDeal(id: string): Promise<CrmDeal | null>;
  listDealStages(): Promise<CrmDealStage[]>;
  /** Currencies the CRM accepts for deal values; a deal in any other currency is blocked, never converted */
  currencies(): Promise<{ primary: string; all: string[] }>;
  /** Link to the object in the CRM's own UI, if the provider supports it */
  recordUrl(type: CrmObjectType, id: string): string | null;
}

/** Normalized provider failure; `retryable` drives bounded retries in the job. */
export class CrmError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CrmError";
  }
}
