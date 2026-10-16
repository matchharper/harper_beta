const SLACK_SENT_USING_SUFFIX =
  /\s*\*(?:다음을 사용하여 보냄|sent using)\*\s*<@[A-Z0-9]+>\s*$/i;

/** Removes Slack-authored transport attribution from the actual user text. */
export function stripSlackSentUsingAttribution(value: unknown) {
  return String(value ?? "")
    .replace(SLACK_SENT_USING_SUFFIX, "")
    .trim();
}

/**
 * Messages posted by other Slack apps are stored for the thread record under
 * this message type. Company-side readers select "chat"/"slack" rows, so these
 * never become company user turns in prompts, summaries, routing or stats.
 */
export const OTHER_SLACK_BOT_MESSAGE_TYPE = "slack_bot";

/** True for a Slack message posted by an app other than Harper. */
export function isOtherSlackBotMessage(
  message: { bot_id?: string; subtype?: string; user?: string },
  harperBotUserId: string
) {
  const isBot = Boolean(String(message.bot_id ?? "").trim()) ||
    message.subtype === "bot_message";
  const user = String(message.user ?? "").trim();
  return isBot && (!user || user !== String(harperBotUserId ?? "").trim());
}

/**
 * True when the text mentions Slack members (people or bots) but not Harper,
 * i.e. the message is addressed to someone else.
 */
export function mentionsOnlyOtherSlackMembers(
  value: unknown,
  harperBotUserId: string
) {
  const mentioned = Array.from(
    stripSlackSentUsingAttribution(value).matchAll(
      /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g
    ),
    (match) => match[1]
  );
  return (
    mentioned.length > 0 &&
    !mentioned.includes(String(harperBotUserId ?? "").trim())
  );
}
