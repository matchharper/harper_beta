const SLACK_SENT_USING_SUFFIX =
  /\s*\*(?:다음을 사용하여 보냄|sent using)\*\s*<@[A-Z0-9]+>\s*$/i;

/** Removes Slack-authored transport attribution from the actual user text. */
export function stripSlackSentUsingAttribution(value: unknown) {
  return String(value ?? "")
    .replace(SLACK_SENT_USING_SUFFIX, "")
    .trim();
}
