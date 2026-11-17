import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GTM_CANDIDATE_COMPANY_FALLBACK, GTM_ROLE_PURPOSE, GTM_WORKSPACE_ID } from "./constants";
import { cleanPublicDescription } from "./shared";

/**
 * The company name candidates read for every GTM Role: the GTM workspace's own name (내 기회 shows it for the Role,
 * as for any Role). Which company it is goes in the Role's name as its description.
 */
export async function gtmWorkspaceCompanyName() {
  const { data, error } = await getSupabaseAdmin().from("company_workspace").select("company_name")
    .eq("company_workspace_id", GTM_WORKSPACE_ID).maybeSingle();
  if (error) throw error;
  return data?.company_name?.trim() || GTM_CANDIDATE_COMPANY_FALLBACK;
}

/**
 * The description a company's GTM Roles already use (the oldest one), so one company always reads the same to
 * candidates; null for a company without a GTM Role yet.
 */
export async function gtmCompanyDescription(companyName: string | null | undefined) {
  const name = companyName?.trim();
  if (!name) return null;
  const { data, error } = await getSupabaseAdmin().from("company_roles")
    .select("description:information->gtm->>publicDescription")
    .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("information->>purpose", GTM_ROLE_PURPOSE)
    .ilike("information->gtm->>companyName", name.replace(/[\\%_]/g, (char) => `\\${char}`))
    .not("information->gtm->>publicDescription", "is", null)
    .order("created_at", { ascending: true }).limit(1)
    .returns<Array<{ description: string | null }>>();
  if (error) throw error;
  return cleanPublicDescription(data?.[0]?.description);
}

/** A GTM Role's company as candidates read it in a mail and on its Harper page; null for any other Role. */
export async function gtmRoleCandidateLabel(roleId: string | null) {
  if (!roleId) return null;
  const { data, error } = await getSupabaseAdmin().from("company_roles")
    .select("company_workspace_id,information").eq("role_id", roleId).maybeSingle();
  if (error) throw error;
  const information = (data?.information ?? {}) as { purpose?: unknown; gtm?: { publicDescription?: unknown; companyName?: unknown } };
  if (data?.company_workspace_id !== GTM_WORKSPACE_ID || information.purpose !== GTM_ROLE_PURPOSE) return null;
  const description = cleanPublicDescription(typeof information.gtm?.publicDescription === "string" ? information.gtm.publicDescription : null);
  return {
    workspaceName: await gtmWorkspaceCompanyName(),
    description,
    realName: typeof information.gtm?.companyName === "string" ? information.gtm.companyName : null,
  };
}
