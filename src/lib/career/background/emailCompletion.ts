import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { CareerReplyCheckpoint } from "../capabilities/runtime";

/** A durable provider receipt, not a prior queued tool response, ends scheduled mail. */
export async function scheduledEmailWasSent(args: {
  admin: TalentAdminClient; userId: string; runId: string; checkpoint?: CareerReplyCheckpoint;
}) {
  const pending = args.checkpoint?.waitFor;
  if (!pending?.length || !pending.every(work => work.kind === "email_delivery")) return false;
  const { data, error } = await args.admin.from("talent_opportunity_delivery")
    .select("id,status").eq("talent_id", args.userId).eq("discovery_run_id", args.runId)
    .in("id", pending.map(work => work.id));
  if (error) throw error;
  return pending.every(work => data?.some(row => row.id === work.id && row.status === "sent"));
}
