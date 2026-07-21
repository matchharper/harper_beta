export const CRM_CAMPAIGN_STATUSES = ["draft", "active", "paused"] as const;

export type OpsCrmCampaignStatus = (typeof CRM_CAMPAIGN_STATUSES)[number];

export type OpsCrmCampaign = {
  createdAt: string;
  htmlContent: string;
  id: string;
  maxSendsPerUser: number;
  name: string;
  status: OpsCrmCampaignStatus;
  updatedAt: string;
};

export type OpsCrmCampaignsResponse = {
  campaigns: OpsCrmCampaign[];
};

export type OpsCrmCampaignSaveInput = {
  htmlContent?: unknown;
  id?: unknown;
  maxSendsPerUser?: unknown;
  name?: unknown;
  status?: unknown;
};

export type OpsCrmCampaignSaveResponse = {
  campaign: OpsCrmCampaign;
  ok: true;
};
