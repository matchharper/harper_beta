import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import { profileToolContext } from "../profiles/tools";
import { readProfileSnapshot } from "../profiles/store";
import {
  assignRoleMaterials,
  readRoleMaterials,
  type RoleMaterial,
} from "../roleMaterials/store";
import { requestInternalRoleEvaluation } from "../matching/internalEvaluation";
import { encodeMaterialSelection } from "@/lib/agentContacts/contracts";
import { readAcceptanceSelections } from "@/lib/agentContacts/materialSelection";

export async function executeApplyToInternalRole(
  input: Record<string, unknown>,
  context: TalentToolExecutionContext | undefined
) {
  const args = profileToolContext(context, "apply_to_internal_role", input),
    roleId = String(input.roleId ?? "");
  if (!roleId) throw new Error("roleId is required.");
  const { data: opportunity, error } = await (args.admin.rpc as any)("ensure_requested_internal_role_v1", {
    p_talent: args.userId, p_role: roleId, p_operation: args.operationId,
    p_source: { ...args.source, backgroundRunId: context?.backgroundInvocation?.runId },
  });
  if (error) throw new Error(error.message);
  // Preserve the card even if the evaluator/profile service is unavailable.
  const saved = { ...opportunity, postingRoleIds: [roleId], companyShared: false, introductionRequested: Boolean(opportunity.introductionRootId) };
  try {
  const assignment = await readRoleMaterials({ ...args, roleId });
  const prepared =
    assignment.current?.action === "set" ? assignment.current : null;
  const profile = await readProfileSnapshot({
    ...args,
    profileId: prepared?.profile_id ?? undefined,
    revision: prepared?.profile_revision ?? undefined,
  });
  const evaluation = await requestInternalRoleEvaluation({
    ...args,
    conversationId: context!.conversationId!,
    roleIds: [roleId],
    profileId: profile.profileId,
    profileRevision: profile.revision,
    requestedOpportunityId: opportunity.recommendationId,
    signal: context?.abortSignal,
  });
  return {
    ...saved,
    ...evaluation,
    evaluatedProfile: {
      profileId: profile.profileId,
      revision: profile.revision,
    },
    assignedMaterial:
      assignment.current?.action === "set"
        ? {
            materialId: assignment.current.id,
            profileId: assignment.current.profile_id,
            profileRevision: assignment.current.profile_revision,
            revision: assignment.current.revision,
          }
        : null,
  };
  } catch (error) {
    console.warn("[internal-application] Opportunity saved; evaluation unavailable", {
      recommendationId: opportunity.recommendationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...saved, status: "evaluation_unavailable" };
  }
}
export function formatInternalApplicationToolResult(
  name: string,
  value: unknown
): string {
  const result = value as Record<string, any>;
  if (name === "apply_to_internal_role")
    return [
      `Role: ${result.role?.roleId ?? result.postingRoleIds?.[0]}; ${result.role?.name ?? ""}`,
      `Company: ${result.role?.companyName ?? ""}`,
      `Company description: ${result.role?.companyDescription ?? ""}`,
      `Role description: ${result.role?.description ?? ""}`,
      ...["location", "workMode", "compensation"].flatMap(key => result.role?.[key] ? [`${key}: ${result.role[key]}`] : []),
      `Opportunity: ${result.recommendationId}; ${result.visible ? "in candidate opportunity list" : "existing archived opportunity; its decision was preserved"}`,
      result.introductionRootId ? `Existing introduction: ${result.introductionRootId}; read_agent_messages contains its delivery facts.` : "",
      `Assessment: ${result.status ?? "unavailable"}${result.runId ? `; run ${result.runId}` : ""}`,
      result.assignedMaterial
        ? `Prepared materials: ${result.assignedMaterial.materialId}; profile ${result.assignedMaterial.profileId} revision ${result.assignedMaterial.profileRevision}; assignment revision ${result.assignedMaterial.revision}`
        : "No prepared assignment; acceptance will pin the default profile.",
      "Sharing scope of this call: candidate only.",
    ].join("\n");
  const current = (result.current ??
    (result.id ? result : null)) as RoleMaterial | null;
  return [
    `Role materials: ${current?.role_id ?? "-"}`,
    result.selectionRef ? `Sharing selection reference: ${result.selectionRef}` : "",
    current
      ? `Material ID: ${current.id}; assignment revision ${result.latestRevision ?? current.revision}; ${current.action === "clear" ? "preparation cleared" : "prepared"}`
      : `No prepared materials; assignment revision ${result.latestRevision ?? 0}.`,
    current?.profile_id
      ? `Profile: ${current.profile_id}; revision ${current.profile_revision}`
      : "Default profile will be pinned when accepted.",
    ...(current?.documents ?? []).map(
      (doc) =>
        `- Document ${doc.id}; revision ${doc.revision ?? 1}; ${doc.file_name}; ${doc.storage_path ? "file saved" : "file not yet rendered"}`
    ),
    ...(result.acceptedMaterials ?? []).map(
      (pin: any) =>
        `Accepted material ${pin.shared_material_id}; recommendation ${pin.id}; decision ${pin.feedback ?? "-"}`
    ),
    "Preparing or clearing materials does not accept, cancel, or change already accepted introductions.",
  ].join("\n");
}
export const CAREER_INTERNAL_APPLICATION_TOOLS: Record<
  string,
  TalentToolDefinition
> = {
  apply_to_internal_role: {
    name: "apply_to_internal_role",
    description:
      TOOL_DESCRIPTIONS.apply_to_internal_role,
    parameters: {
      type: "object",
      properties: {
        roleId: { type: "string" },
      },
      required: ["roleId"],
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    execute: executeApplyToInternalRole,
  },
  assign_to_role: {
    name: "assign_to_role",
    description:
      TOOL_DESCRIPTIONS.assign_to_role,
    parameters: {
      type: "object",
      properties: {
        roleId: { type: "string" },
        action: { type: "string", enum: ["read", "set", "clear"] },
        expectedRevision: { type: "integer" },
        profileId: { type: "string" },
        profileRevision: { type: "integer" },
        documents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              documentId: { type: "string" },
              revision: { type: "integer" },
            },
            required: ["documentId", "revision"],
            additionalProperties: false,
          },
        },
      },
      required: ["roleId", "action"],
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    async execute(input, context) {
      const args = profileToolContext(context, "assign_to_role", input, {
          readOnly: input.action === "read",
        }),
        roleId = String(input.roleId ?? "");
      if (!roleId) throw new Error("roleId is required.");
      if (input.action === "read") {
        const result=await readRoleMaterials({ ...args, roleId });
        const selectionRef=result.current?.action==='set' ? encodeMaterialSelection({materialId:result.current.id,assignmentRevision:result.latestRevision})
          : (await readAcceptanceSelections(args.admin,args.userId,[roleId])).get(roleId)?.selectionRef;
        return {...result,selectionRef};
      }
      if (
        !["set", "clear"].includes(String(input.action)) ||
        typeof input.expectedRevision !== "number"
      )
        throw new Error(
          "action and expectedRevision are required. Read the current assignment first."
        );
      const result=await assignRoleMaterials({
        ...args,
        roleId,
        action: input.action as "set" | "clear",
        expectedRevision: input.expectedRevision,
        profileId:
          typeof input.profileId === "string" ? input.profileId : undefined,
        profileRevision:
          typeof input.profileRevision === "number"
            ? input.profileRevision
            : undefined,
        documents: input.documents as any,
      });
      const selectionRef=result.action==='set'?encodeMaterialSelection({materialId:result.id,assignmentRevision:result.revision})
        : (await readAcceptanceSelections(args.admin,args.userId,[roleId])).get(roleId)?.selectionRef;
      return {...result,selectionRef};
    },
  },
};
