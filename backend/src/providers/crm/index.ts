import { isHubspotConfigured } from "../../config/env.js";
import { providerNotConfigured } from "../../utils/errors.js";
import { HubspotCrmProvider } from "./hubspot.js";
import type { CrmProvider } from "./types.js";

let override: CrmProvider | null = null;

/** Test hook: replace the live CRM with a fake (never used in production paths). */
export function setCrmProviderForTests(provider: CrmProvider | null) {
  override = provider;
}

export function getCrmProvider(): CrmProvider {
  if (override) return override;
  if (!isHubspotConfigured()) throw providerNotConfigured("hubspot", "HUBSPOT_ACCESS_TOKEN");
  return new HubspotCrmProvider();
}

export function isCrmConfigured(): boolean {
  return Boolean(override) || isHubspotConfigured();
}

export function crmProviderStatus() {
  return { provider: override?.name ?? "hubspot", configured: isCrmConfigured() };
}

export type { CrmProvider } from "./types.js";
export { CrmError } from "./types.js";
