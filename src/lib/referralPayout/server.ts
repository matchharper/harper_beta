import "server-only";

import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  encryptReferralPayoutValue,
  hashReferralPayoutAccessToken,
} from "@/lib/referralPayout/security";
import {
  REFERRAL_PAYOUT_PRIVACY_CONSENT_VERSION,
  REFERRAL_PAYOUT_TAX_ENTITY_TYPES,
  type ReferralPayoutStatus,
  type ReferralPayoutSubmission,
  type ReferralPayoutTaxEntityType,
} from "@/lib/referralPayout/types";
import type { Database } from "@/types/database.types";

type PayoutInformationRow =
  Database["public"]["Tables"]["talent_referral_payout_information"]["Row"];

const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;
const MAX_LEGAL_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 300;
const MAX_BANK_NAME_LENGTH = 60;

export class ReferralPayoutError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ReferralPayoutError";
    this.status = status;
  }
}

function normalizeAccessToken(value: unknown) {
  const token = String(value ?? "").trim();
  if (!ACCESS_TOKEN_PATTERN.test(token)) {
    throw new ReferralPayoutError(
      404,
      "유효하지 않은 지급정보 입력 링크입니다."
    );
  }
  return token;
}

function normalizeText(value: unknown, label: string, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new ReferralPayoutError(400, `${label}을(를) 입력해 주세요.`);
  }
  if (normalized.length > maxLength) {
    throw new ReferralPayoutError(
      400,
      `${label}은(는) ${maxLength}자 이하로 입력해 주세요.`
    );
  }
  return normalized;
}

function normalizeDigits(
  value: unknown,
  label: string,
  minLength: number,
  maxLength = minLength
) {
  const normalized = String(value ?? "").replace(/\D/g, "");
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new ReferralPayoutError(400, `${label} 형식을 확인해 주세요.`);
  }
  return normalized;
}

function validateRegistrationBirthDate(value: string) {
  const discriminator = Number(value[6]);
  const century = [1, 2, 5, 6].includes(discriminator) ? 1900 : 2000;
  const year = century + Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    ![1, 2, 3, 4, 5, 6, 7, 8].includes(discriminator) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ReferralPayoutError(
      400,
      "주민·외국인등록번호 형식을 확인해 주세요."
    );
  }
}

function normalizeSubmission(value: unknown): ReferralPayoutSubmission {
  const body = (value ?? {}) as Partial<ReferralPayoutSubmission>;
  const taxEntityType = String(body.taxEntityType ?? "").trim();
  if (
    !REFERRAL_PAYOUT_TAX_ENTITY_TYPES.includes(
      taxEntityType as ReferralPayoutTaxEntityType
    )
  ) {
    throw new ReferralPayoutError(400, "소득자 유형을 선택해 주세요.");
  }
  if (body.isKoreanTaxResident !== true) {
    throw new ReferralPayoutError(
      400,
      "현재 페이지는 국내 세법상 거주자만 제출할 수 있습니다. chris@matchharper.com으로 문의해 주세요."
    );
  }
  if (body.privacyConsent !== true || body.accuracyConfirmed !== true) {
    throw new ReferralPayoutError(400, "필수 확인 항목에 동의해 주세요.");
  }

  const residentRegistrationNumber = normalizeDigits(
    body.residentRegistrationNumber,
    "주민·외국인등록번호",
    13
  );
  validateRegistrationBirthDate(residentRegistrationNumber);

  const businessRegistrationNumber =
    taxEntityType === "sole_proprietor"
      ? normalizeDigits(body.businessRegistrationNumber, "사업자등록번호", 10)
      : null;

  return {
    accuracyConfirmed: true,
    address: normalizeText(body.address, "주소", MAX_ADDRESS_LENGTH),
    bankAccountHolder: normalizeText(
      body.bankAccountHolder,
      "예금주",
      MAX_LEGAL_NAME_LENGTH
    ),
    bankAccountNumber: normalizeDigits(
      body.bankAccountNumber,
      "계좌번호",
      6,
      20
    ),
    bankName: normalizeText(body.bankName, "은행", MAX_BANK_NAME_LENGTH),
    businessRegistrationNumber,
    isKoreanTaxResident: true,
    legalName: normalizeText(
      body.legalName,
      "법적 성명",
      MAX_LEGAL_NAME_LENGTH
    ),
    phone: normalizeDigits(body.phone, "휴대전화번호", 9, 12),
    privacyConsent: true,
    residentRegistrationNumber,
    taxEntityType: taxEntityType as ReferralPayoutTaxEntityType,
  };
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return true;
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

async function getPayoutInformationByToken(token: string) {
  const admin = getTalentSupabaseAdmin();
  const { data, error } = await admin
    .from("talent_referral_payout_information")
    .select(
      "id, referral_application_id, referrer_user_id, access_token_hash, access_token_expires_at, submitted_at"
    )
    .eq("access_token_hash", hashReferralPayoutAccessToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ReferralPayoutError(
      404,
      "유효하지 않은 지급정보 입력 링크입니다."
    );
  }
  const row = data as Pick<
    PayoutInformationRow,
    | "access_token_expires_at"
    | "id"
    | "referral_application_id"
    | "referrer_user_id"
    | "submitted_at"
  >;
  if (isExpired(row.access_token_expires_at)) {
    throw new ReferralPayoutError(
      410,
      "지급정보 입력 링크가 만료되었습니다. chris@matchharper.com으로 새 링크를 요청해 주세요."
    );
  }
  return { admin, row };
}

export async function getReferralPayoutStatus(
  rawToken: unknown
): Promise<ReferralPayoutStatus> {
  const token = normalizeAccessToken(rawToken);
  const { admin, row } = await getPayoutInformationByToken(token);
  const [applicationResult, referrerResult] = await Promise.all([
    admin
      .from("talent_referral_application")
      .select("amount, reward_due_at")
      .eq("id", row.referral_application_id)
      .maybeSingle(),
    admin
      .from("talent_users")
      .select("name")
      .eq("user_id", row.referrer_user_id)
      .maybeSingle(),
  ]);
  if (applicationResult.error) throw applicationResult.error;
  if (referrerResult.error) throw referrerResult.error;
  if (!applicationResult.data) {
    throw new ReferralPayoutError(404, "지급 대상 정보를 찾지 못했습니다.");
  }

  return {
    accessTokenExpiresAt: row.access_token_expires_at as string,
    referrerName: referrerResult.data?.name ?? null,
    rewardAmount: applicationResult.data.amount ?? null,
    rewardDueAt: applicationResult.data.reward_due_at ?? null,
    submittedAt: row.submitted_at,
  };
}

export async function submitReferralPayoutInformation(args: {
  submission: unknown;
  token: unknown;
}) {
  const token = normalizeAccessToken(args.token);
  const submission = normalizeSubmission(args.submission);
  const { admin, row } = await getPayoutInformationByToken(token);
  if (row.submitted_at) {
    throw new ReferralPayoutError(409, "이미 지급정보 제출이 완료되었습니다.");
  }

  const now = new Date().toISOString();
  const encrypt = (field: string, value: string) =>
    encryptReferralPayoutValue({ field, recordId: row.id, value });
  const { data, error } = await admin
    .from("talent_referral_payout_information")
    .update({
      accuracy_confirmed_at: now,
      address_ciphertext: encrypt("address", submission.address),
      bank_account_holder_ciphertext: encrypt(
        "bank_account_holder",
        submission.bankAccountHolder
      ),
      bank_account_number_ciphertext: encrypt(
        "bank_account_number",
        submission.bankAccountNumber
      ),
      bank_name: submission.bankName,
      business_registration_number_ciphertext:
        submission.businessRegistrationNumber
          ? encrypt(
              "business_registration_number",
              submission.businessRegistrationNumber
            )
          : null,
      is_korean_tax_resident: true,
      legal_name_ciphertext: encrypt("legal_name", submission.legalName),
      phone_ciphertext: encrypt("phone", submission.phone),
      privacy_consent_version: REFERRAL_PAYOUT_PRIVACY_CONSENT_VERSION,
      privacy_consented_at: now,
      resident_registration_number_ciphertext: encrypt(
        "resident_registration_number",
        submission.residentRegistrationNumber
      ),
      submitted_at: now,
      tax_entity_type: submission.taxEntityType,
    })
    .eq("id", row.id)
    .is("submitted_at", null)
    .select("submitted_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ReferralPayoutError(409, "이미 지급정보 제출이 완료되었습니다.");
  }
  return { submittedAt: data.submitted_at as string };
}
