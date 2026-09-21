import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export async function saveTalentPosting(args: {
  admin: TalentAdminClient;
  roleId: string;
  userId: string;
}) {
  const { data: role, error } = await args.admin
    .from("company_roles")
    .select(
      "role_id,source_type,source_provider,information,company_workspace_id"
    )
    .eq("role_id", args.roleId)
    .maybeSingle();
  if (error) throw error;
  const information = role?.information as Record<string, unknown> | null;
  if (
    !role ||
    role.source_type !== "external" ||
    String(information?.testOnly ?? "false") === "true"
  ) {
    throw new Error("Job unavailable");
  }
  const { data: existing, error: existingError } = await args.admin
    .from("talent_opportunity_recommendation")
    .select("id,feedback,saved_stage")
    .eq("talent_id", args.userId)
    .eq("role_id", args.roleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  // Imported private links are visible only to the talent who saved them.
  if (role.source_provider === "user_submitted" && !existing)
    throw new Error("Job unavailable");
  if (existing?.feedback === "like" && existing.saved_stage !== "hidden")
    return existing.id;

  // Reuse the atomic, advisory-lock protected save path. With an existing role
  // it creates neither a company nor a role, and performs recommendation + like
  // together. It also preserves an existing recommendation's identity.
  const { data, error: saveError } = await args.admin.rpc(
    "import_talent_job_link",
    {
      p_existing_role_id: args.roleId,
      p_role: {},
      p_saved_stage: "saved",
      p_talent_id: args.userId,
      p_workspace: {},
      p_workspace_id: role.company_workspace_id,
    }
  );
  if (saveError) throw saveError;
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved?.recommendation_id) throw new Error("Failed to save job");
  return saved.recommendation_id;
}
