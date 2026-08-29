export const SLACK_CHANNEL_CREATION_SCOPES = [
  "channels:manage",
  "groups:write",
] as const;

export const SLACK_CHANNEL_NAME_MAX_LENGTH = 80;

export function normalizeSlackChannelName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^#+/, "");
}

export function getSlackChannelNameError(value: unknown) {
  const channelName = normalizeSlackChannelName(value);
  if (!channelName) return "채널 이름을 입력해 주세요.";
  if (channelName.length > SLACK_CHANNEL_NAME_MAX_LENGTH) {
    return `채널 이름은 ${SLACK_CHANNEL_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`;
  }
  if (!/^[a-z0-9_-]+$/.test(channelName)) {
    return "영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 사용할 수 있어요.";
  }
  return null;
}
