export const OPS_REFERRALS_PAGE_SIZE = 20;

export type OpsReferralPerson = {
  createdAt: string | null;
  email: string | null;
  headline: string | null;
  name: string | null;
  userId: string;
};

export type OpsReferralStageOption = {
  id: string;
  label: string;
};

export type OpsReferralPayoutNotification = {
  sentAt: string;
  sentByEmail: string | null;
};

export type OpsReferralPayoutInformation = {
  accessTokenExpiresAt: string | null;
  notificationHistory: OpsReferralPayoutNotification[];
  submittedAt: string | null;
};

export type OpsReferralItem = {
  amount: string | null;
  applicationId: string | null;
  companyName: string;
  currentStage: string;
  currentStageLabel: string;
  hiredAt: string | null;
  memo: string | null;
  payoutInformation: OpsReferralPayoutInformation;
  recommendationId: string;
  recommendedAt: string;
  referred: OpsReferralPerson;
  referrer: OpsReferralPerson;
  rewardDueAt: string | null;
  rewardPaid: boolean;
  rewardPaidAt: string | null;
  roleId: string;
  roleName: string;
  settlementCompletedAt: string | null;
  stageOptions: OpsReferralStageOption[];
};

export type OpsReferralListResponse = {
  items: OpsReferralItem[];
  limit: number;
  offset: number;
  stageOptions: OpsReferralStageOption[];
  total: number;
};

export type OpsReferralEditableField =
  | "amount"
  | "hiredAt"
  | "memo"
  | "rewardPaid"
  | "rewardPaidAt"
  | "settlementCompletedAt";

export type OpsReferralApplicationValues = Pick<
  OpsReferralItem,
  | "amount"
  | "applicationId"
  | "hiredAt"
  | "memo"
  | "rewardDueAt"
  | "rewardPaid"
  | "rewardPaidAt"
  | "settlementCompletedAt"
>;

export type OpsReferralUpdateResponse = {
  application?: OpsReferralApplicationValues;
  currentStage?: string;
  ok: true;
};

export type OpsReferralPayoutRequestResponse = {
  ok: true;
  payoutInformation: OpsReferralPayoutInformation;
};
