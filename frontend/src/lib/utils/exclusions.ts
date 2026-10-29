/** Offer exclusions hold company names or website domains, one per entry */
const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const normDomain = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

export function makeExclusionMatcher(exclusions: string[]) {
  const names = new Set(exclusions.map(normName).filter(Boolean));
  const domains = new Set(exclusions.filter((e) => e.includes(".")).map(normDomain).filter(Boolean));
  return (company: { name: string; domain: string | null }) =>
    names.has(normName(company.name)) || (company.domain ? domains.has(normDomain(company.domain)) : false);
}
