import "server-only";

import { fetchCareerJobPosting } from "@/lib/career/jobLinkImport";
import { getExaClient } from "@/lib/tools/exaClient";
import { GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID } from "./constants";
import { gtmRead } from "./db.server";
import { extractEmails, type GtmJd } from "./shared";

export { extractEmails, type GtmJd };

export type CustomerRoleOption = {
  roleId: string;
  name: string;
  status: string;
  workspaceId: string;
  companyName: string;
  activeRoles: number;
};

/** The longest JD text the gtm-plays API takes back in later calls (jdSchema.description). */
const JD_MAX_LENGTH = 20_000;

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/\r/g, "").trim().slice(0, max);
}

/** Roles of Harper customers (internal workspaces), Harper's own and test-only Roles left out. */
export async function listCustomerRoles(): Promise<CustomerRoleOption[]> {
  const rows = await gtmRead((sql) => sql<Array<{
    role_id: string; name: string; status: string; workspace_id: string; company_name: string; active_roles: number;
  }>>`
    select r.role_id::text as role_id, r.name, r.status, w.company_workspace_id::text as workspace_id,
      coalesce(nullif(btrim(w.published_name), ''), w.company_name) as company_name,
      (select count(*) from public.company_roles active
        where active.company_workspace_id = w.company_workspace_id and active.source_type = 'internal'
          and active.status in ('active', 'top_priority'))::int as active_roles
    from public.company_roles r
    join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    where w.is_internal is true and r.source_type = 'internal'
      and r.status in ('active', 'paused', 'top_priority')
      and w.company_workspace_id <> all(array[${HARPER_WORKSPACE_ID}, ${GTM_WORKSPACE_ID}]::uuid[])
      and coalesce(lower(btrim(r.information->>'testOnly')), '') not in ('true', '1', 'yes', 'on')
    order by company_name, r.name
    limit 400
  `);
  return rows.map((row) => ({
    roleId: row.role_id, name: row.name, status: row.status, workspaceId: row.workspace_id,
    companyName: row.company_name, activeRoles: Number(row.active_roles ?? 0),
  }));
}

export async function readCustomerRoleJd(roleId: string): Promise<GtmJd> {
  const rows = await gtmRead((sql) => sql<Array<{
    name: string; description: string | null; external_jd_url: string | null; location_text: string | null;
    request: string | null; company_name: string; workspace_id: string; contact_email: string | null;
  }>>`
    select r.name, r.description, r.external_jd_url, r.location_text, i.request,
      coalesce(nullif(btrim(w.published_name), ''), w.company_name) as company_name,
      w.company_workspace_id::text as workspace_id,
      r.information->'hiringPost'->>'contactEmail' as contact_email
    from public.company_roles r
    join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    left join public.company_internal_roles i on i.role_id = r.role_id
    where r.role_id = ${roleId}::uuid and w.is_internal is true
  `);
  const row = rows[0];
  if (!row) throw new Error("고객 Role을 찾지 못했어요.");
  // The API accepts a JD of at most 20,000 characters (route jdSchema); the Role text and its request together stay under it.
  const description = [clean(row.description, 12_000), clean(row.request, 12_000)].filter(Boolean).join("\n\n")
    .slice(0, JD_MAX_LENGTH);
  return {
    source: "customer_role",
    companyName: row.company_name,
    title: row.name,
    description,
    url: row.external_jd_url,
    location: row.location_text,
    sourceRoleId: roleId,
    sourceWorkspaceId: row.workspace_id,
    contactEmails: extractEmails(row.contact_email, description),
  };
}

/** Reads a posting the same way a candidate's saved link is read (Exa contents, a fraction of a cent). */
export async function readJdFromUrl(url: string): Promise<GtmJd> {
  const exa = String(process.env.EXA_API_KEY ?? "").trim() ? getExaClient() : undefined;
  const draft = await fetchCareerJobPosting({ exa, url });
  const description = clean(draft.description ?? draft.descriptionSummary, 16_000);
  return {
    source: "url",
    companyName: clean(draft.companyName, 200),
    title: clean(draft.title, 200),
    description,
    url: draft.canonicalUrl ?? url,
    location: draft.location,
    sourceRoleId: null,
    sourceWorkspaceId: null,
    contactEmails: extractEmails(description),
  };
}

export function jdFromText(args: { companyName: string; title: string; text: string; url?: string | null }): GtmJd {
  const description = clean(args.text, 16_000);
  return {
    source: "text",
    companyName: clean(args.companyName, 200),
    title: clean(args.title, 200),
    description,
    url: args.url?.trim() || null,
    location: null,
    sourceRoleId: null,
    sourceWorkspaceId: null,
    contactEmails: extractEmails(description),
  };
}
