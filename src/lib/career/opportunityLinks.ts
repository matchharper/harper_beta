import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

/** The Career history reader selects an owned, saved opportunity by Role ID. */
export function careerOpportunityUrl(roleId: string, baseUrl = getConfiguredPublicSiteUrl()) {
  const url = new URL("/career/history", baseUrl);
  url.searchParams.set("historyTab", "new");
  url.searchParams.set("id", roleId);
  return url.href;
}
