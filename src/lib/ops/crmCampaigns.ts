export const CRM_CAMPAIGN_STATUSES = ["active", "paused"] as const;
export const CRM_CAMPAIGN_PREFERRED_LOCALES = ["ko", "en"] as const;

export type OpsCrmCampaignStatus = (typeof CRM_CAMPAIGN_STATUSES)[number];
export type OpsCrmCampaignPreferredLocale =
  (typeof CRM_CAMPAIGN_PREFERRED_LOCALES)[number];

export type OpsCrmCampaign = {
  createdAt: string;
  emailTitle: string;
  htmlContent: string;
  id: string;
  maxSendsPerUser: number;
  maxTotalSends: number;
  name: string;
  recipientPreferredLocale: OpsCrmCampaignPreferredLocale | null;
  status: OpsCrmCampaignStatus;
  updatedAt: string;
};

export type OpsCrmCampaignsResponse = {
  campaigns: OpsCrmCampaign[];
};

export type OpsCrmCampaignStats = {
  campaignId: string;
  sentEmailCount: number;
  uniqueClickerCount: number;
  uniqueRecipientCount: number;
};

export type OpsCrmCampaignStatsResponse = {
  stats: OpsCrmCampaignStats;
};

export type OpsCrmCampaignSaveInput = {
  emailTitle?: unknown;
  htmlContent?: unknown;
  id?: unknown;
  maxSendsPerUser?: unknown;
  maxTotalSends?: unknown;
  name?: unknown;
  recipientPreferredLocale?: unknown;
  status?: unknown;
};

export type OpsCrmCampaignSaveResponse = {
  campaign: OpsCrmCampaign;
  ok: true;
};

export type OpsCrmCampaignTestEmailInput = {
  emailTitle?: unknown;
  htmlContent?: unknown;
  id?: unknown;
  maxSendsPerUser?: unknown;
  maxTotalSends?: unknown;
  name?: unknown;
  recipientPreferredLocale?: unknown;
  status?: unknown;
};

export type OpsCrmCampaignTestEmailResponse = {
  ok: true;
  resendEmailId: string | null;
  toEmail: string;
};
