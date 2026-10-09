/** Mark the existing company report only after verified Slack delivery. */
export async function recordAcceptedCandidateDelivery(
  admin: { from: (table: string) => any },
  row: { delivery_kind: string; candidate_ids: string[]; id: string; run_id: string },
  status: "sent" | "canceled"
) {
  if (row.delivery_kind !== "accepted_connection") return;
  const { data, error } = await admin.from("talent_progress")
    .select("id,metadata").in("id", row.candidate_ids).eq("kind", "intro_to_company");
  if (error) throw error;
  if (status === "sent" && data?.length !== row.candidate_ids.length)
    throw new Error("Accepted delivery report is missing");
  for (const progress of data ?? []) {
    const metadata = progress.metadata && typeof progress.metadata === "object" ? progress.metadata : {};
    if (metadata.deliveryOwner !== "role_matching_outbox")
      throw new Error("Accepted delivery owner changed");
    if (status === "canceled") {
      if (metadata.slackSent === true) continue;
      const { data: other, error: otherError } = await admin.from("company_first_slack_outbox")
        .select("id").eq("run_id", row.run_id).neq("id", row.id)
        .contains("candidate_ids", [progress.id]).in("status", ["pending", "sending", "failed", "sent"]).limit(1);
      if (otherError) throw otherError;
      if (other?.length) continue;
    }
    const { error: updateError } = await admin.from("talent_progress")
      .update({ metadata: { ...metadata, deliveryStatus: status, slackSent: status === "sent",
        slackSentAt: status === "sent" ? new Date().toISOString() : null } })
      .eq("id", progress.id).eq("kind", "intro_to_company");
    if (updateError) throw updateError;
  }
}
