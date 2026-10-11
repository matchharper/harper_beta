import { billingErrorCopy, isBillingErrorCode } from "@/lib/org/billing/types";
import type { OrgLocale } from "./locale";

const ENGLISH_SLACK_ERRORS = new Map([
  ["같은 이름의 Slack 채널이 이미 있어요. 다른 이름을 입력해 주세요.", "A Slack channel with that name already exists. Choose another name."],
  ["채널 생성 권한이 없어요. Slack을 다시 연결해 새 권한을 승인해 주세요.", "Reconnect Slack and approve channel creation permissions."],
  ["이 Slack Workspace에서는 Harper가 채널을 만들 수 없어요. Slack 관리자에게 채널 생성 설정을 확인해 주세요.", "Harper cannot create channels in this Slack workspace. Ask a Slack admin to check its settings."],
  ["채널 이름을 사용할 수 없어요. 영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 입력해 주세요.", "Use lowercase letters, numbers, hyphens, or underscores for the channel name."],
  ["Slack 요청이 많아 채널을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", "Too many Slack requests. Try again shortly."],
]);

export function localizedOrgErrorMessage(
  error: unknown,
  locale: OrgLocale,
  fallback: string
): string {
  const billingCode = error && typeof error === "object" && "billingCode" in error ? error.billingCode : null;
  if (isBillingErrorCode(billingCode)) return billingErrorCopy(billingCode, locale);
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  if (locale === "ko") return message;
  return ENGLISH_SLACK_ERRORS.get(message) ??
    (/[가-힣]/.test(message) ? fallback : message);
}
