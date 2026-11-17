import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GTM_ROLE_PURPOSE, GTM_WORKSPACE_ID } from "./constants";
import { cleanPublicDescription } from "./shared";

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
