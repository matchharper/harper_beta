import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { updateTalentOpportunityHistoryItem } from "@/lib/talentOpportunity";

const stages = ["saved", "applied", "connected", "offer", "closed", "hidden"] as const;

/** Reuse the Jobs UI executor: owned, current recommendations and idempotent activity. */
export async function setOpportunityStages(args: {
  admin: TalentAdminClient;
  userId: string;
  items?: Array<Record<string, unknown>>;
}) {
  if (!args.items?.length) throw new Error("set_stage requires existing opportunity items");
  const stageUpdates = [];
  for (const item of args.items) {
    try {
      const savedStage = item.savedStage as typeof stages[number];
      if (!stages.includes(savedStage)) throw new Error("Invalid savedStage");
      if (!item.recommendationId && !item.roleId) throw new Error("recommendationId or roleId is required");
      let query = (args.admin.from("talent_opportunity_recommendation") as any)
        .select("id,role_id").eq("talent_id", args.userId);
      if (item.recommendationId) query = query.eq("id", item.recommendationId);
      if (item.roleId) query = query.eq("role_id", item.roleId);
      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Owned opportunity not found");
      const receipt = await updateTalentOpportunityHistoryItem({
        admin: args.admin, userId: args.userId, opportunityId: data.id,
        action: "saved_stage", savedStage,
      });
      stageUpdates.push({ recommendationId: data.id, roleId: data.role_id, savedStage, updatedAt: receipt.updatedAt });
    } catch (error) {
      stageUpdates.push({ recommendationId: item.recommendationId, roleId: item.roleId,
        error: error instanceof Error ? error.message : String(error) });
    }
  }
  const failures = stageUpdates.filter(item => item.error).length;
  return { ok: failures === 0, status: failures === 0 ? "completed" : failures === stageUpdates.length ? "failed" : "partial", stageUpdates };
}
