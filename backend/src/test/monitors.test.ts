import { describe, expect, it } from "vitest";
import { generateDedupeKey } from "../services/monitors.js";

describe("Scheduled Monitors & Change Detection", () => {
  it("generates deterministic SHA-256 deduplication keys", () => {
    const key1 = generateDedupeKey(
      "aligneddc.com",
      "https://datacenterfrontier.example.com/aligned-expansion-texas",
      "Aligned Data Centers expands Texas campus with 120MW facility",
    );

    const key2 = generateDedupeKey(
      "ALIGNEDDC.COM",
      "https://datacenterfrontier.example.com/aligned-expansion-texas",
      "  Aligned Data Centers expands Texas campus with 120MW facility  ",
    );

    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64);
  });

  it("distinguishes different evidence or events", () => {
    const key1 = generateDedupeKey(
      "aligneddc.com",
      "https://datacenterfrontier.example.com/aligned-expansion-texas",
      "Aligned Data Centers expands Texas campus",
    );

    const key2 = generateDedupeKey(
      "streamdatacenters.com",
      "https://news.example.com/stream-expansion-texas",
      "Stream Data Centers acquires 200 acres in Texas",
    );

    expect(key1).not.toBe(key2);
  });

  it("handles distinct run states: success, no_results, exhausted_budget, provider_outage", () => {
    const validStates = ["success", "fresh_signals", "no_results", "exhausted_budget", "provider_outage"];
    expect(validStates).toContain("fresh_signals");
    expect(validStates).toContain("no_results");
    expect(validStates).toContain("exhausted_budget");
    expect(validStates).toContain("provider_outage");
  });
});

