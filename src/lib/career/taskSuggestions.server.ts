import type { TalentAdminClient } from "@/lib/talentOnboarding/server";
import { resolveCompanyLogoUrl } from "@/lib/imageUrl";
import type { CareerExternalFeedbackOpportunity } from "./taskItems";

type ExternalFeedbackRow = {
  id: string;
  role_id: string;
  created_at: string;
  company_role: {
    company_workspace: {
      company_name: string;
      logo_url: string | null;
      company_db: { logo: string | null } | null;
    };
  };
};

// This task preview needs only four logos and navigation IDs. Keep it separate
// from the history loader's counts, meetings, documents and activity queries.
export async function fetchCareerExternalFeedbackSuggestions({
  admin,
  userId,
}: {
  admin: TalentAdminClient;
  userId: string;
}): Promise<CareerExternalFeedbackOpportunity[]> {
  const { data, error } = await (
    admin.from("talent_effective_opportunity_recommendations_v1" as any) as any
  )
    .select(
      `
      id, role_id, created_at,
      company_role:company_roles!inner (
        source_type,
        company_workspace:company_workspace!inner (
          company_name, logo_url, company_db:company_db (logo)
        )
      )
    `
    )
    .eq("talent_id", userId)
    .eq("company_role.source_type", "external")
    .is("feedback", null)
    .or("saved_stage.is.null,saved_stage.neq.hidden")
    .neq("kind", "user_link_import")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(4);
  if (error) throw new Error(error.message);

  return ((data ?? []) as ExternalFeedbackRow[]).map((row) => {
    const workspace = row.company_role.company_workspace;
    return {
      id: row.id,
      roleId: row.role_id,
      recommendedAt: row.created_at,
      companyName:
        workspace.company_name.replace(/\s+/g, " ").trim() || "Unknown company",
      companyLogoUrl: resolveCompanyLogoUrl({
        companyDbLogoUrl: workspace.company_db?.logo,
        workspaceLogoUrl: workspace.logo_url,
      }),
    };
  });
}
