import type {
  OpsReferralEditableField,
  OpsReferralItem,
  OpsReferralPayoutInformation,
} from "@/lib/ops/referrals";

export type OpsReferralUiField = OpsReferralEditableField | "stage";

export type OpsReferralUpdateHandler = (
  item: OpsReferralItem,
  field: OpsReferralUiField,
  value: unknown
) => Promise<boolean>;

export type OpsReferralPayoutInformationUpdatedHandler = (
  item: OpsReferralItem,
  payoutInformation: OpsReferralPayoutInformation
) => void;
