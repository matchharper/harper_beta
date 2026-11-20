/**
 * The settings Ashley's replies and the company mails added to gtm_agent_settings (11/21), read and cleaned the same
 * way from the row and from the /ops form. Pure.
 *   replyAgentEnabled         Ashley answers replies (its own switch beside the agent's)
 *   handoffSlackUserId        the Slack user a reply is handed to (@mention in the reply alert's thread)
 *   companyMailMinCandidates  a company mail needs at least this many fitting candidates
 */

export const DEFAULT_REPLY_AGENT_ENABLED = true;
export const DEFAULT_COMPANY_MAIL_MIN_CANDIDATES = 2;
export const COMPANY_MAIL_MIN_CANDIDATES_RANGE = { min: 1, max: 10 } as const;

/** A Slack user id (U… or W…), also when pasted as a mention (<@U…>); null when empty or not an id. */
export function cleanHandoffSlackUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().replace(/^<@([^>|]+)(?:\|[^>]*)?>$/, "$1").replace(/^@/, "").trim().toUpperCase();
  return /^[UW][A-Z0-9]{2,20}$/.test(id) ? id : null;
}

/** A whole number within the range; the default when missing or not a number. */
export function cleanCompanyMailMinCandidates(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return DEFAULT_COMPANY_MAIL_MIN_CANDIDATES;
  const { min, max } = COMPANY_MAIL_MIN_CANDIDATES_RANGE;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export type ReplySettingsFields = {
  replyAgentEnabled: boolean;
  handoffSlackUserId: string | null;
  companyMailMinCandidates: number;
};

/** From the settings row (the columns are missing before their migration: the defaults then). */
export function replySettingsFromRow(row: {
  reply_agent_enabled?: boolean | null; handoff_slack_user_id?: string | null; company_mail_min_candidates?: number | string | null;
}): ReplySettingsFields {
  return {
    replyAgentEnabled: typeof row.reply_agent_enabled === "boolean" ? row.reply_agent_enabled : DEFAULT_REPLY_AGENT_ENABLED,
    handoffSlackUserId: cleanHandoffSlackUserId(row.handoff_slack_user_id),
    companyMailMinCandidates: cleanCompanyMailMinCandidates(row.company_mail_min_candidates),
  };
}
