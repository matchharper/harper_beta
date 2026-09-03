import type { OpsCrmCampaignPreferredLocale } from "@/lib/ops/crmCampaigns";

export const CRM_BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "completed",
] as const;

export type OpsCrmBroadcastStatus = (typeof CRM_BROADCAST_STATUSES)[number];

export type OpsCrmBroadcastDeliveryCounts = {
  cancelled: number;
  failed: number;
  paused: number;
  processing: number;
  queued: number;
  sent: number;
  total: number;
};

export type OpsCrmBroadcast = {
  completedAt: string | null;
  createdAt: string;
  deliveryCounts: OpsCrmBroadcastDeliveryCounts;
  htmlContent: string;
  id: string;
  name: string;
  queuedAt: string | null;
  recipientOnboardingDoneOnly: boolean;
  recipientPreferredLocale: OpsCrmCampaignPreferredLocale | null;
  scheduledAt: string | null;
  status: OpsCrmBroadcastStatus;
  subject: string;
  updatedAt: string;
};

export type OpsCrmBroadcastsResponse = {
  broadcasts: OpsCrmBroadcast[];
};

export type OpsCrmBroadcastSaveInput = {
  htmlContent?: unknown;
  id?: unknown;
  name?: unknown;
  recipientOnboardingDoneOnly?: unknown;
  recipientPreferredLocale?: unknown;
  scheduledAt?: unknown;
  subject?: unknown;
};

export type OpsCrmBroadcastSaveResponse = {
  broadcast: OpsCrmBroadcast;
  ok: true;
};

export type OpsCrmBroadcastAudienceInput = {
  recipientOnboardingDoneOnly?: unknown;
  recipientPreferredLocale?: unknown;
};

export type OpsCrmBroadcastAudienceResponse = {
  recipientCount: number;
};

export type OpsCrmBroadcastQueueResponse = {
  ok: true;
  queuedRecipientCount: number;
};

export type OpsCrmBroadcastPauseResponse = {
  ok: true;
  paused: boolean;
};

export type OpsCrmBroadcastTestEmailResponse = {
  ok: true;
  resendEmailId: string | null;
  toEmail: string;
};
