export type OrgRoleNotificationChannel = {
  channelId: string;
  channelName: string | null;
  enabled: boolean;
};

export type OrgRoleNotificationSettings = {
  assigneeUserIds: string[];
  channels: OrgRoleNotificationChannel[];
  roleId: string;
};

export type OrgRoleNotificationSettingsUpdate = {
  assigneeUserIds?: string[];
  channels?: Array<{ channelId: string; enabled: boolean }>;
  roleId: string;
  workspaceId: string;
};
