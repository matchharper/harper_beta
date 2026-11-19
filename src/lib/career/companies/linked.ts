import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const looksLikeCompanyUrl = (value: string) => /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value);
const comparable = (value: string) => value.toLowerCase().replace(/[\s.,()·&_-]+/g, "");
const titled = (label: string) => label.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
// Second-level labels under a country domain (scatterlab.co.kr, example.com.au) are not the company's name.
const SECOND_LEVEL = new Set(["co", "com", "or", "ne", "ac", "go", "re", "pe", "net", "org", "gov", "edu"]);
const siteLabel = (host: string) => {
  const parts = host.split(".");
  return parts.length >= 3 && parts.at(-1)!.length === 2 && SECOND_LEVEL.has(parts.at(-2)!) ? parts.at(-3)! : parts.at(-2) ?? host;
};

/**
 * The company an address names. A LinkedIn company page names one. Any other
 * address names the company whose site it is on, and only the site's own
 * address can add a company Harper does not know yet: a page such as an
 * article or a post can sit on someone else's site.
 */
export function companyIdentityOf(value: string) {
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new Error("not a usable address"); }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (/(^|\.)linkedin\.com$/.test(host)) {
    const slug = url.pathname.match(/^\/company\/([^/?#]+)/i)?.[1];
    if (!slug) throw new Error("a LinkedIn page that is not a company page does not identify a company");
    return { name: titled(slug), linkedinUrl: `https://www.linkedin.com/company/${slug}`, match: `%linkedin.com/company/${slug}%`, column: "linkedin_url", canAdd: true };
  }
  const siteRoot = (url.pathname === "" || url.pathname === "/") && !url.search;
  return { name: titled(siteLabel(host)), homepageUrl: `https://${host}`, match: `%${host}%`, column: "homepage_url", canAdd: siteRoot };
}

/**
 * The one company a Memory row or note is about, from whatever Harper knows:
 * a workspace ID, an official site or LinkedIn company page, or a name. Any
 * company qualifies, Harper-connected ones included; an unknown site or page is
 * added to the shared directory as search does.
 */
export async function resolveLinkedCompany(admin: TalentAdminClient, reference: string, options: { register?: boolean } = {}) {
  const value = reference.trim();
  if (!value) throw new Error("Name the company by name, official site, LinkedIn page or workspace ID.");
  if (UUID.test(value)) {
    const { data, error } = await db(admin, "company_workspace").select("company_workspace_id,company_name")
      .eq("company_workspace_id", value).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Company ${value} is unavailable.`);
    return { id: data.company_workspace_id as string, name: (data.company_name ?? value) as string };
  }
  if (looksLikeCompanyUrl(value)) {
    let identity;
    try { identity = companyIdentityOf(value); } catch (error) { throw new Error(`${value}: ${(error as Error).message}.`); }
    const { data, error } = await db(admin, "company_workspace").select("company_workspace_id,company_name")
      .ilike(identity.column, identity.match).order("is_internal", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    if (data?.[0]) return { id: data[0].company_workspace_id as string, name: (data[0].company_name ?? identity.name) as string };
    if (options.register === false) throw new Error(`${value} is not in Harper's company directory.`);
    if (!identity.canAdd) throw new Error(`No company in Harper's directory has the site of ${value}, and a page address does not add one. Name the company's own site or LinkedIn company page.`);
    const { data: created, error: insertError } = await db(admin, "company_workspace").insert({
      company_name: identity.name, homepage_url: identity.homepageUrl ?? null, linkedin_url: identity.linkedinUrl ?? null,
      is_internal: false, is_scrape_original: false, has_career_page: false,
    }).select("company_workspace_id,company_name").single();
    if (insertError) throw new Error(insertError.message);
    return { id: created.company_workspace_id as string, name: created.company_name as string, added: true };
  }
  const { searchCareerCompanies } = await import("../companies/server");
  const companies: Row[] = (await searchCareerCompanies({ admin, queries: [value] })).companies
    .filter((company: Row) => typeof company.companyWorkspaceId === "string");
  const exact = companies.filter(company => company.name && comparable(company.name) === comparable(value));
  if (exact.length === 1) return { id: exact[0].companyWorkspaceId as string, name: exact[0].name as string };
  const candidates = (exact.length ? exact : companies).slice(0, 3)
    .map(company => `${company.name ?? "?"} (${company.companyWorkspaceId})`).join(", ");
  throw new Error(candidates
    ? `"${value}" matches more than one company or none exactly: ${candidates}. Pass the workspace ID, official site or LinkedIn page.`
    : `"${value}" is not in Harper's company directory. Pass its official site or LinkedIn page to add it.`);
}
