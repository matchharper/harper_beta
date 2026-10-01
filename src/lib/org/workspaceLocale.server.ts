import "server-only";

import { localeFromHeadquarters } from "./workspaceLocale";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type Admin = ReturnType<typeof getSupabaseAdmin>;

export async function getOrgWorkspaceLocale(
  workspaceId: string,
  admin: Admin = getSupabaseAdmin()
) {
  const { data: workspace, error: workspaceError } = await admin
    .from("company_workspace")
    .select("company_db_id")
    .eq("company_workspace_id", workspaceId)
    .single();
  if (workspaceError) throw workspaceError;
  if (!workspace.company_db_id) return "en" as const;
  const { data: company, error: companyError } = await admin
    .from("company_db")
    .select("location")
    .eq("id", workspace.company_db_id)
    .maybeSingle();
  if (companyError) throw companyError;
  return localeFromHeadquarters(company?.location);
}
