/**
 * The settings Ashley's replies and the company mails added to gtm_agent_settings (11/21), read and cleaned the same
 * way from the row and from the /ops form. Pure.
 *   replyAgentEnabled         Ashley answers replies (its own switch beside the agent's)
 *   handoffSlackUserId        the Slack user a reply is handed to (@mention in the reply alert's thread)
 * (company_mail_min_candidates is no longer read: a company mail goes once one candidate agrees, Shaun 11/21 17:04.)
 */

// Off until the real-reply test passes; switched on from /ops.
export const DEFAULT_REPLY_AGENT_ENABLED = false;

/** A Slack user id (U… or W…), also when pasted as a mention (<@U…>); null when empty or not an id. */
export function cleanHandoffSlackUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().replace(/^<@([^>|]+)(?:\|[^>]*)?>$/, "$1").replace(/^@/, "").trim().toUpperCase();
  return /^[UW][A-Z0-9]{2,20}$/.test(id) ? id : null;
}

export type ReplySettingsFields = {
  replyAgentEnabled: boolean;
  handoffSlackUserId: string | null;
};

/** From the settings row (the columns are missing before their migration: the defaults then). */
export function replySettingsFromRow(row: {
  reply_agent_enabled?: boolean | null; handoff_slack_user_id?: string | null;
}): ReplySettingsFields {
  return {
    replyAgentEnabled: typeof row.reply_agent_enabled === "boolean" ? row.reply_agent_enabled : DEFAULT_REPLY_AGENT_ENABLED,
    handoffSlackUserId: cleanHandoffSlackUserId(row.handoff_slack_user_id),
  };
}
