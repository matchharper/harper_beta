export const COMPANY_EMAIL_PREFERENCE_TOOL = {
  type: "function" as const,
  function: {
    name: "update_email_preferences" as const,
    description: "Stop or resume the authenticated team member's proactive email notices across workspaces. Scope is Slack connection notices or all proactive notices. Does not change other recipients, hiring, Slack, direct replies, or essential account mail.",
    parameters: { type: "object", additionalProperties: false, required: ["scope", "enabled"],
      properties: { scope: { type: "string", enum: ["slack_connection", "all_proactive"] }, enabled: { type: "boolean" } } },
  },
};
export const COMPANY_EMAIL_PREFERENCE_POLICY = `Handle explicit email opt-out or resumption using update_email_preferences for the authenticated person. Interpret scope from the latest message and correspondence; do not ask again for a clear request. An opt-out affects proactive email only, not hiring, candidates, Slack or replies to messages the person sends. Confirm only the saved scope and effective result.`;
export function companyEmailTopicEnabled(preferences: Record<string, unknown> | null | undefined, topic: string) {
  return preferences?.all_proactive !== false && preferences?.[topic] !== false;
}
