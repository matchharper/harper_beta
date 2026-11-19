import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { resolveCompanyNames } from "./companyNames";
import { resolvePoolNumbers } from "./candidatePool";
import { companyIdentityOf, looksLikeCompanyUrl } from "@/lib/career/companies/linked";

/** Turns the company references an agent writes (option numbers, workspace IDs,
 * names, official sites, LinkedIn pages) into public company workspaces. */
type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function publicIds(admin: TalentAdminClient, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await db(admin, "company_workspace").select("company_workspace_id")
    .in("company_workspace_id", ids).eq("is_internal", false);
  if (error) throw new Error(error.message);
  const ok = new Set((data ?? []).map((r: Row) => r.company_workspace_id));
  return ids.filter(id => ok.has(id));
}

/** Option numbers, workspace IDs or names → company workspace IDs. */
export async function resolveCompanyRefs(admin: TalentAdminClient, matchingId: string | undefined, refs: unknown[] | undefined) {
  const notes: string[] = [];
  const list = (refs ?? []).filter(r => r !== null && r !== undefined && String(r).trim() !== "");
  const numbers = list.filter(r => typeof r === "number" || /^\d+$/.test(String(r))).map(Number);
  const uuids = list.map(String).filter(r => UUID.test(r));
  const names = list.map(String).filter(r => !UUID.test(r) && !/^\d+$/.test(r));
  const ids: string[] = [];
  if (numbers.length) {
    const pool = await resolvePoolNumbers(admin, matchingId, numbers);
    const roleIds = [...pool.values()].flatMap(k => k.roleId ? [k.roleId] : []);
    const { data } = roleIds.length ? await db(admin, "company_roles").select("company_workspace_id").in("role_id", roleIds) : { data: [] };
    ids.push(...[...pool.values()].flatMap(k => k.companyWorkspaceId ? [k.companyWorkspaceId] : []),
      ...(data ?? []).map((r: Row) => r.company_workspace_id));
  }
  ids.push(...await publicIds(admin, uuids));
  if (names.length) {
    const named = await resolveNamed(admin, names);
    ids.push(...named.ids);
    notes.push(...named.notes);
  }
  return { ids: [...new Set(ids)], notes };
}

/**
 * Names resolve against Harper's company directory. A site's own address or a
 * LinkedIn company page that no company has yet registers one, so a team found
 * on the web is compared with everything else. Harper-connected companies are not
 * covered and are reported without saying why.
 */
export async function resolveNamed(admin: TalentAdminClient, entries: string[]) {
  const ids: string[] = [], notes: string[] = [], registered: string[] = [];
  const urls = entries.filter(looksLikeCompanyUrl), names = entries.filter(e => !looksLikeCompanyUrl(e));
  for (const value of urls) {
    let identity;
    try { identity = companyIdentityOf(value); } catch (error) { notes.push(`${value}: ${(error as Error).message}`); continue; }
    const { data, error } = await db(admin, "company_workspace").select("company_workspace_id,company_name,is_internal")
      .ilike(identity.column, identity.match).order("is_internal", { ascending: false }).limit(5);
    if (error) throw new Error(error.message);
    const rows: Row[] = data ?? [];
    if (rows.some(r => r.is_internal)) { notes.push(`${value}: not covered by this search`); continue; }
    if (rows.length) { ids.push(rows[0].company_workspace_id); continue; }
    if (!identity.canAdd) {
      notes.push(`${value}: no company in Harper's directory has this site, and a page address does not add one; name the company's own site or LinkedIn company page`);
      continue;
    }
    const { data: created, error: insertError } = await db(admin, "company_workspace").insert({
      company_name: identity.name, homepage_url: identity.homepageUrl ?? null, linkedin_url: identity.linkedinUrl ?? null,
      is_internal: false, is_scrape_original: false, has_career_page: false,
    }).select("company_workspace_id").single();
    if (insertError) throw new Error(insertError.message);
    ids.push(created.company_workspace_id);
    registered.push(created.company_workspace_id);
    notes.push(`${value}: added to Harper's company directory as "${identity.name}"`);
  }
  if (names.length) {
    for (const item of await resolveCompanyNames(admin, names)) {
      if (item.excluded) notes.push(`${item.query}: not covered by this search`);
      else if (!item.matches.length) notes.push(`${item.query}: not in Harper's company directory; name its official website or LinkedIn page to add it`);
      else {
        ids.push(...item.matches.map(m => m.companyWorkspaceId));
        if (item.partial) notes.push(`${item.query}: no exact name; compared ${item.matches.map(m => m.name).join(", ")}`);
      }
    }
  }
  return { ids: [...new Set(ids)], notes, registered };
}
