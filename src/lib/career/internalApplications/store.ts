import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
export async function publishEvaluatedInternalRole(args: {
  admin: TalentAdminClient;
  userId: string;
  roleId: string;
  evaluationIds: string[];
  sourceRunId: string;
  operationId: string;
}) {
  const { data, error } = await (args.admin.rpc as any)(
    "publish_evaluated_internal_role_v1",
    {
      p_talent_id: args.userId,
      p_role_id: args.roleId,
      p_evaluation_ids: args.evaluationIds,
      p_source_run_id: args.sourceRunId,
      p_operation_id: args.operationId,
    }
  );
  if (error) throw new Error(error.message);
  return data as {
    recommendationId: string;
    roleId: string;
    created: boolean;
    evaluationIds: string[];
    feedback: string | null;
    savedStage: string | null;
  };
}
