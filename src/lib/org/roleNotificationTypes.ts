export type OrgRoleNotificationChannel = {
  channelId: string;
  channelName: string | null;
  enabled: boolean;
};

export type OrgRoleNotificationSettings = {
  channels: OrgRoleNotificationChannel[];
  roleId: string;
};

export type OrgRoleNotificationSettingsUpdate = {
  channels?: Array<{ channelId: string; enabled: boolean }>;
  roleId: string;
  workspaceId: string;
};
