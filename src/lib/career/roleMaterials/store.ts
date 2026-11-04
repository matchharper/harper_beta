import {
  readResumeContent,
  GENERATED_RESUME_ORIGIN,
} from "@/lib/resumes/schema";
import { resumePlainText } from "@/lib/resumes/template";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import type { ProfileSnapshot } from "../profiles/store";

export type RoleMaterial = {
  id: string;
  talent_id: string;
  role_id: string;
  revision: number;
  action: string;
  profile_id: string | null;
  profile_revision: number | null;
  profile_snapshot: ProfileSnapshot | null;
  documents: TalentDocumentRow[];
  source: Record<string, unknown>;
  created_at: string;
};
export async function readRoleMaterials(args: {
  admin: TalentAdminClient;
  userId: string;
  roleId: string;
}) {
  const { data, error } = await (
    args.admin.from("talent_role_materials" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .eq("role_id", args.roleId)
    .order("revision", { ascending: false });
  if (error) throw error;
  const { data: pins, error: pinError } = await (
    args.admin.from("talent_opportunity_recommendation") as any
  )
    .select("id,shared_material_id,feedback,saved_stage")
    .eq("talent_id", args.userId)
    .eq("role_id", args.roleId)
    .not("shared_material_id", "is", null);
  if (pinError) throw pinError;
  const history = (data ?? []) as RoleMaterial[];
  return {
    current: history.find(row => row.source?.defaultAcceptance !== true && row.source?.agentSnapshot !== true) ?? null,
    latestRevision: history[0]?.revision ?? 0,
    history,
    acceptedMaterials: pins ?? [],
  };
}
export async function assignRoleMaterials(args: {
  admin: TalentAdminClient;
  userId: string;
  roleId: string;
  action: "set" | "clear";
  expectedRevision: number;
  profileId?: string;
  profileRevision?: number;
  documents?: Array<{ documentId: string; revision: number }>;
  operationId: string;
  source?: Record<string, unknown>;
}) {
  const { data, error } = await (args.admin.rpc as any)(
    "assign_talent_role_materials_v1",
    {
      p_talent_id: args.userId,
      p_role_id: args.roleId,
      p_action: args.action,
      p_expected_revision: args.expectedRevision,
      p_profile_id: args.profileId ?? null,
      p_profile_revision: args.profileRevision ?? null,
      p_documents: args.documents ?? [],
      p_operation_id: args.operationId,
      p_source: args.source ?? {},
    }
  );
  if (error) throw new Error(error.message);
  return data as RoleMaterial;
}

/** Caller must authorize company member and pair visibility before consuming this reader. */
export async function resolveRoleSharedMaterials(args: {
  admin: TalentAdminClient;
  userId: string;
  roleId: string;
  workspaceId?: string;
  recommendationId?: string;
}): Promise<RoleMaterial | null> {
  const { data: owner, error: ownerError } = await args.admin
    .from("talent_users")
    .select("user_id")
    .eq("user_id", args.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (!owner) throw new Error("Profile owner unavailable.");
  if (args.workspaceId) {
    const { data: role, error } = await args.admin
      .from("company_roles")
      .select("role_id")
      .eq("role_id", args.roleId)
      .eq("company_workspace_id", args.workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!role) throw new Error("Role workspace mismatch.");
  }
  let query = (args.admin.from("talent_opportunity_recommendation") as any)
    .select("shared_material_id")
    .eq("talent_id", args.userId)
    .eq("role_id", args.roleId)
    .not("shared_material_id", "is", null)
    .order("recommended_at", { ascending: false })
    .limit(1);
  if (args.recommendationId) query = query.eq("id", args.recommendationId);
  const { data: rec, error } = await query.maybeSingle();
  if (error) throw error;
  if (!rec?.shared_material_id) return null;
  const { data, error: materialError } = await (
    args.admin.from("talent_role_materials" as any) as any
  )
    .select("*")
    .eq("id", rec.shared_material_id)
    .eq("talent_id", args.userId)
    .eq("role_id", args.roleId)
    .maybeSingle();
  if (materialError) throw materialError;
  if (!data) throw new Error("Accepted materials are unavailable.");
  return data as RoleMaterial;
}

/** Exact assignment token for a UI/button or a delegated chat acceptance. */
export async function readRoleAcceptanceMaterial(args: {
  admin: TalentAdminClient;
  userId: string;
  roleId: string;
}) {
  const { current, latestRevision } = await readRoleMaterials(args);
  return {
    materialId: current?.action === "set" ? current.id : null,
    assignmentRevision: latestRevision,
  };
}

/** Only an authorized exact-role material is accepted; no current/private document lookup. */
export function projectRoleMaterialDocuments(material: RoleMaterial) {
  return material.documents.map((document) => ({
    documentId: document.id,
    revision: document.revision ?? 1,
    title: document.file_name,
    description:
      document.origin_type === GENERATED_RESUME_ORIGIN
        ? resumePlainText(readResumeContent(document.structured_content))
        : (document.extracted_text ?? ""),
  }));
}
