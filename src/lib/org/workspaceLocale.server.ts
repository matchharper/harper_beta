import "server-only";

import { isOrgLocale, type OrgLocale } from "@/i18n/org/locale";
import { resolveOrgWorkspaceLocale } from "./workspaceLocale";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type Admin = ReturnType<typeof getSupabaseAdmin>;

function isMissingLocaleColumn(
  error: { code?: string; message?: string } | null
) {
  if (!error || !/locale/i.test(error.message ?? "")) return false;
  return error.code === "42703" || error.code === "PGRST204";
}

// Until company_workspace.locale exists in a database, company messages keep
// the Headquarters rule instead of failing.
async function fetchWorkspaceLocaleSource(workspaceId: string, admin: Admin) {
  const saved = await admin
    .from("company_workspace")
    .select("company_db_id, locale")
    .eq("company_workspace_id", workspaceId)
    .single();
  if (!isMissingLocaleColumn(saved.error)) {
    if (saved.error) throw saved.error;
    return saved.data;
  }
  const { data, error } = await admin
    .from("company_workspace")
    .select("company_db_id")
    .eq("company_workspace_id", workspaceId)
    .single();
  if (error) throw error;
  return { ...data, locale: null };
}

// Returns false when company_workspace.locale does not exist in this database yet.
export async function saveOrgWorkspaceLocale(
  workspaceId: string,
  locale: OrgLocale,
  admin: Admin = getSupabaseAdmin()
) {
  const { data, error } = await admin
    .from("company_workspace")
    .update({ locale })
    .eq("company_workspace_id", workspaceId)
    .select("locale")
    .maybeSingle();
  if (isMissingLocaleColumn(error)) return false;
  if (error) throw error;
  return data?.locale === locale;
}

// A language saved on the workspace wins; otherwise Headquarters decides.
export async function getOrgWorkspaceLocale(
  workspaceId: string,
  admin: Admin = getSupabaseAdmin()
) {
  const workspace = await fetchWorkspaceLocaleSource(workspaceId, admin);
  if (isOrgLocale(workspace.locale)) return workspace.locale;
  if (!workspace.company_db_id) return resolveOrgWorkspaceLocale(workspace.locale, null);
  const { data: company, error: companyError } = await admin
    .from("company_db")
    .select("location")
    .eq("id", workspace.company_db_id)
    .maybeSingle();
  if (companyError) throw companyError;
  return resolveOrgWorkspaceLocale(workspace.locale, company?.location);
}
