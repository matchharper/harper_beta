const INTERNAL_OPPORTUNITY_DECISION_SLACK_CHANNEL_BY_WORKSPACE_ID: Readonly<
  Record<string, string>
> = Object.freeze({
  "720254d7-aeb7-4709-a56f-7b822f89eac5": "C09CRN4TFC4",
});

export function getInternalOpportunityDecisionSlackChannelId(
  companyWorkspaceId: string | null | undefined
) {
  const workspaceId = String(companyWorkspaceId ?? "").trim();
  return (
    INTERNAL_OPPORTUNITY_DECISION_SLACK_CHANNEL_BY_WORKSPACE_ID[workspaceId] ??
    null
  );
}
