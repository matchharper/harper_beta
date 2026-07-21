export const REFERRAL_PAYOUT_PRIVACY_CONSENT_VERSION = "2026-07-21";

export const REFERRAL_PAYOUT_TAX_ENTITY_TYPES = [
  "individual",
  "sole_proprietor",
] as const;

export type ReferralPayoutTaxEntityType =
  (typeof REFERRAL_PAYOUT_TAX_ENTITY_TYPES)[number];

export type ReferralPayoutStatus = {
  accessTokenExpiresAt: string;
  referrerName: string | null;
  rewardAmount: string | null;
  rewardDueAt: string | null;
  submittedAt: string | null;
};

export type ReferralPayoutSubmission = {
  accuracyConfirmed: boolean;
  address: string;
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankName: string;
  businessRegistrationNumber?: string | null;
  isKoreanTaxResident: boolean;
  legalName: string;
  phone: string;
  privacyConsent: boolean;
  residentRegistrationNumber: string;
  taxEntityType: ReferralPayoutTaxEntityType;
};
