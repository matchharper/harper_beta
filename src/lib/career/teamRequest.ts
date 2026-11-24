import type { TalentToolDefinition } from "@/lib/talentOnboarding/tools";
import { postCareerInquirySlack, saveCareerInquiry } from "@/lib/careerInquiry.server";

export const CONTACT_HARPER_TEAM_TOOL_NAME = "contact_harper_team";
const TEAM_REQUEST_SOURCE = "career-team-request";
const TITLE = "Career Team Request (Harper)";

/**
 * The user's message to the Harper team, passed on because the user asked for it.
 * One message from the user reaches the team once, even if the turn is retried.
 */
export const CAREER_TEAM_REQUEST_TOOLS: Record<string, TalentToolDefinition> = {
  [CONTACT_HARPER_TEAM_TOOL_NAME]: {
    name: CONTACT_HARPER_TEAM_TOOL_NAME,
    channels: ["chat"],
    description:
      "Pass a message to the Harper team. Use only when the user directly asks for something to reach the team.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "What the user asked to pass on, with what the team needs to act on it.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
    async execute(input, context) {
      const admin = context?.admin as { from: (table: string) => any } | undefined;
      const userId = context?.userId;
      if (!admin || !userId)
        throw new Error(`${CONTACT_HARPER_TEAM_TOOL_NAME} requires an authenticated conversation.`);
      const message = String(input.message ?? "").trim();
      if (!message) return { modelOutput: "Nothing was passed on: the message was empty." };

      const requestKey = String(context.resumeRequestId ?? context.userMessageId ?? context.toolCallId ?? "").trim();
      if (requestKey) {
        const { data: existing, error } = await admin
          .from("feedback")
          .select("id")
          .eq("user_id", userId)
          .eq("from", TEAM_REQUEST_SOURCE)
          .like("content", `%\nRequest: ${requestKey.replace(/[\\%_]/g, "\\$&")}\n%`)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (existing) return { modelOutput: "Already passed to the Harper team." };
      }

      const { data: user, error: userError } = await admin
        .from("talent_users")
        .select("name,email")
        .eq("user_id", userId)
        .maybeSingle();
      if (userError) throw userError;
      const fields: Array<[string, string]> = [
        ["Name", String(user?.name ?? "").trim() || "-"],
        ["Email", String(user?.email ?? "").trim() || "-"],
      ];

      // The team sees it in Slack; if that fails, nothing is recorded and Harper says it was not passed on.
      await postCareerInquirySlack({ userId, title: TITLE, fields, content: message });
      try {
        await saveCareerInquiry({
          db: admin as never,
          userId,
          source: TEAM_REQUEST_SOURCE,
          title: TITLE,
          fields: [...fields, ...(requestKey ? [["Request", requestKey] as [string, string]] : [])],
          content: message,
        });
      } catch (error) {
        console.error("[contact_harper_team] saved record failed after the team was notified", error);
      }
      return { modelOutput: "Passed to the Harper team." };
    },
  },
};
