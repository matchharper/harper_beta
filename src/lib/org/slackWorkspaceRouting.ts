export type SlackChannelIdentity = {
  channelId: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function filterUnclaimedSlackChannels<T extends SlackChannelIdentity>(
  channels: T[],
  claimedChannelIds: Iterable<string>
) {
  const claimed = new Set(
    Array.from(claimedChannelIds, (channelId) => text(channelId)).filter(
      Boolean
    )
  );
  return channels.filter((channel) => !claimed.has(text(channel.channelId)));
}

export function shouldRevokeSlackBotToken(otherActiveConnectionCount: number) {
  return otherActiveConnectionCount === 0;
}
