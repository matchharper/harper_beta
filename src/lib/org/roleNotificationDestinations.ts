export const ROLE_NOTIFICATION_DESTINATION_REQUIRED =
  "Slack 채널이나 메일 중 하나는 켜 두어야 해요.";

/** Saved delivery preferences, not a new instruction or a delivery receipt. */
export function formatRoleNotificationDestinations(settings: {
  roleId: string;
  channels: Array<{ channelId: string; channelName: string | null; enabled: boolean }>;
  emailEnabled: boolean;
}) {
  const enabled = settings.channels.filter(channel => channel.enabled);
  return [
    `Saved notification destinations for Role ${settings.roleId}:`,
    `Slack: ${enabled.length ? enabled.map(channel => `${channel.channelName ? `#${channel.channelName} ` : ""}(${channel.channelId})`).join(", ") : "disabled"}.`,
    `New-candidate email notifications: ${settings.emailEnabled ? "enabled for the Role assignees and Owners" : "disabled"}.`,
    "contact_user with chat saves in the Role's web conversation and automatically sends the same message to its enabled, permitted Slack notification channels. Choosing slack uses the same delivery; a second call is unnecessary. Email delivery is separate. Delivery rechecks the current destination and audience permissions.",
  ].join("\n");
}

/**
 * A role keeps at least one place that hears about its new candidates: a
 * Slack channel or email. Only a save that turns something off is checked, so
 * a role that already has neither (e.g. at a company without Slack) can still
 * change its assignee.
 */
export function leavesRoleWithoutNotificationDestination(args: {
  /** The role's current Slack channels, by public channel ID. */
  channels: Array<{ channelId: string; enabled: boolean }>;
  emailEnabled: boolean;
  update: { channels: Map<string, boolean>; emailEnabled?: boolean };
}) {
  const turnsChannelOff = args.channels.some(
    (channel) =>
      channel.enabled && args.update.channels.get(channel.channelId) === false
  );
  const turnsEmailOff = args.emailEnabled && args.update.emailEnabled === false;
  if (!turnsChannelOff && !turnsEmailOff) return false;

  const channelsAfter = args.channels.filter(
    (channel) => args.update.channels.get(channel.channelId) ?? channel.enabled
  ).length;
  const emailAfter = args.update.emailEnabled ?? args.emailEnabled;
  return channelsAfter === 0 && !emailAfter;
}
