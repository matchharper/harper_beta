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
import {
  requestInternalRoleEvaluation,
  readInternalEvaluation,
} from "../matching/internalEvaluation";
import { formatCareerMatchingResult } from "../matching/formatters";

export async function executeApplyToInternalRole(
  input: Record<string, unknown>,
  context: TalentToolExecutionContext | undefined
) {
  const args = profileToolContext(context, "apply_to_internal_role", input),
    roleId = String(input.roleId ?? "");
  if (!roleId) throw new Error("roleId is required.");
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
    replyId: context?.resumeRequestId ?? undefined,
    roleIds: [roleId],
    profileId: profile.profileId,
    profileRevision: profile.revision,
    publishRecommendation: true,
    signal: context?.abortSignal,
  });
  const completed = ["queued", "running"].includes(evaluation.status)
    ? {}
    : await readInternalEvaluation(args.admin, args.userId, evaluation.runId);
  return {
    ...evaluation,
    ...completed,
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
    companyShared: false,
  };
}
export function formatInternalApplicationToolResult(
  name: string,
  value: unknown
): string {
  const result = value as Record<string, any>;
  if (name === "apply_to_internal_role")
    return [
      formatCareerMatchingResult(result),
      result.assignedMaterial
        ? `Prepared materials: ${result.assignedMaterial.materialId}; profile ${result.assignedMaterial.profileId} revision ${result.assignedMaterial.profileRevision}; assignment revision ${result.assignedMaterial.revision}`
        : "No prepared assignment; acceptance will pin the default profile.",
      "This call evaluates and prepares a recommendation for review; it does not record introduction acceptance or share with the company. Queued/running evaluations have not completed.",
    ].join("\n");
  const current = (result.current ??
    (result.id ? result : null)) as RoleMaterial | null;
  return [
    `Role materials: ${current?.role_id ?? "-"}`,
    current
      ? `Material ID: ${current.id}; assignment revision ${current.revision}; ${current.action === "clear" ? "preparation cleared" : "prepared"}`
      : "No prepared materials; assignment revision 0.",
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
      if (input.action === "read")
        return readRoleMaterials({ ...args, roleId });
      if (
        !["set", "clear"].includes(String(input.action)) ||
        typeof input.expectedRevision !== "number"
      )
        throw new Error(
          "action and expectedRevision are required. Read the current assignment first."
        );
      return assignRoleMaterials({
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
    },
  },
};
