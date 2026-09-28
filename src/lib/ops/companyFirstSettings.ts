export type CompanyFirstSettings = {
  scheduled_enabled: boolean;
  schedule_cron: string;
  schedule_timezone: string;
  scheduled_role_limit: number;
  requested_role_limit: number;
  ready_backlog_limit: number;
};

export type CompanyFirstSettingsResponse = {
  settings: CompanyFirstSettings;
  updatedAt: string;
  nextSlots: string[];
};
