import { billingErrorCopy, isBillingErrorCode } from "@/lib/org/billing/types";
import type { OrgLocale } from "./locale";

const ENGLISH_SLACK_ERRORS = new Map([
  ["같은 이름의 Slack 채널이 이미 있어요. 다른 이름을 입력해 주세요.", "A Slack channel with that name already exists. Choose another name."],
  ["채널 생성 권한이 없어요. Slack을 다시 연결해 새 권한을 승인해 주세요.", "Reconnect Slack and approve channel creation permissions."],
  ["이 Slack Workspace에서는 Harper가 채널을 만들 수 없어요. Slack 관리자에게 채널 생성 설정을 확인해 주세요.", "Harper cannot create channels in this Slack workspace. Ask a Slack admin to check its settings."],
  ["채널 이름을 사용할 수 없어요. 영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 입력해 주세요.", "Use lowercase letters, numbers, hyphens, or underscores for the channel name."],
  ["Slack 요청이 많아 채널을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", "Too many Slack requests. Try again shortly."],
]);

const ENGLISH_MEETING_ERRORS = new Map([
  ["연결 대기 후보자를 선택해 인터뷰를 요청해 주세요.", "Select a candidate awaiting connection to request an interview."],
  ["이미 인터뷰 요청이 시작되었어요. 후보자의 현재 진행 상황을 확인해 주세요.", "An interview has already been requested. Check the candidate's current progress."],
  ["후보자 연결은 완료했지만 인터뷰 요청 메일의 발송 상태를 확인하지 못했어요. Harper 채팅에서 이 후보자의 인터뷰 요청 상태를 확인해 주세요.", "The candidate is connected, but we couldn't confirm the interview email status. Ask Harper in chat to check this candidate's interview request before trying again."],
  ["일정 담당자의 Google Calendar를 연결해 주세요. 후보자에게는 아직 연락하지 않았어요.", "Connect the organizer's Google Calendar first. The candidate hasn't been contacted."],
  ["먼저 미팅 가능한 시간을 알려주세요. 후보자에게는 아직 연락하지 않았어요.", "Set your interview availability first. The candidate hasn't been contacted."],
  ["현재 설정과 이미 확정된 미팅을 기준으로 후보자에게 제안할 시간이 없어요. 가능 시간을 넓힌 뒤 다시 준비해 주세요.", "There are no available interview times with your current settings and confirmed meetings. Add more availability and try again."],
]);

export function localizedOrgErrorMessage(
  error: unknown,
  locale: OrgLocale,
  fallback: string
): string {
  const billingCode = error && typeof error === "object" && "billingCode" in error ? error.billingCode : null;
  if (isBillingErrorCode(billingCode)) return billingErrorCopy(billingCode, locale);
  const message = error instanceof Error ? error.message.trim() : "";
  if (message === "org_workspace_under_review") return locale === "ko"
    ? "가입 정보를 검토하고 있어요. 검토가 끝날 때까지 Workspace 이용이 제한돼요."
    : "Your account is under review. Workspace access is paused until the review is complete.";
  if (!message) return fallback;
  if (locale === "ko") return message;
  return ENGLISH_MEETING_ERRORS.get(message) ?? ENGLISH_SLACK_ERRORS.get(message) ??
    (/[가-힣]/.test(message) ? fallback : message);
}
