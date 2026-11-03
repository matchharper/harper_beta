export type OrgPersonalSettings = {
  assignedRoleIds: string[];
  emailEnabled: boolean;
  /** The member's own LinkedIn profile; shown only in an introduction email to an external person. */
  linkedinUrl: string | null;
};

/** An http(s) link, since it goes into an email; empty clears it. Throws on anything else. */
export function normalizeOrgLinkedinUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const url = (() => { try { return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; } })();
  if (!url || !["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
    throw new Error("invalid_linkedin_url");
  }
  return url.toString();
}
