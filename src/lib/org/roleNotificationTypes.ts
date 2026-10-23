export type OrgRoleNotificationChannel = {
  channelId: string;
  channelName: string | null;
  enabled: boolean;
  canAssign?: boolean;
};

export type OrgRoleNotificationSettings = {
  assigneeUserIds: string[];
  channels: OrgRoleNotificationChannel[];
  /** New candidates for this role also go by email to its assignees and the Owners. */
  emailEnabled: boolean;
  roleId: string;
};

export type OrgRoleNotificationSettingsUpdate = {
  assigneeUserIds?: string[];
  channels?: Array<{ channelId: string; enabled: boolean }>;
  emailEnabled?: boolean;
  roleId: string;
  workspaceId: string;
};
