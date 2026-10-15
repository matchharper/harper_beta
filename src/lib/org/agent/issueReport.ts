import { reportToolDiagnostic } from "@/lib/llm/toolExecution";
import { createHash } from "node:crypto";
import { postUserFeedbackSlackMessage } from "@/lib/userFeedbackSlack";

/** Current actor/conversation references come from the authenticated executor. */
export async function reportOrgAgentIssue(args: {
  workspaceId: string; conversationId: string; messageId: number;
  actorId: string; summary: string;
}, send = postUserFeedbackSlackMessage) {
  if (typeof args.summary !== "string" || !args.summary.trim() || args.summary.length > 2500) {
    throw new Error("Report summary must contain 1-2500 characters");
  }
  // Stable across repeated model calls for the same user turn. No automatic retries.
  const hex = createHash("sha256").update(JSON.stringify([
    "company-support", args.workspaceId, args.conversationId, args.messageId,
  ])).digest("hex");
  const reportId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  try {
    const receipt = await send({
      client_msg_id: reportId,
      mrkdwn: false,
      text: ["Company Harper 제보", args.summary.trim(), "",
        `Workspace: ${args.workspaceId}`, `Conversation: ${args.conversationId}`,
        `Message: ${args.messageId}`, `Actor: ${args.actorId}`,
        `Report: ${reportId}`].join("\n"),
    });
    return { status: "sent", reportId, slackMessageTs: receipt.timestamp,
      responseGuidance: "The report was delivered to Harper team members. Do not claim investigation, ticket creation, resolution, or a reply deadline." };
  } catch (error) {
    reportToolDiagnostic(error);
    return { status: "unknown", reportId,
      responseGuidance: "The send was attempted, but neither delivery nor submission is confirmed. Explain this uncertainty directly. There is no verified queued request or follow-up. Do not claim the report was submitted, sent, or recorded; do not automatically retry this turn." };
  }
}
