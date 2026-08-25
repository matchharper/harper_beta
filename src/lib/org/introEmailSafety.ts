const PROCESS_HISTORY_PATTERNS = [
  /\bdeclin(?:e|ed|ing)\b/i,
  /\breject(?:ed|ion|ing)?\b/i,
  /\bclos(?:e|ed|ure)\b[^\n]{0,40}\b(?:process|notice|connection)\b/i,
  /\bstopp?ed\s+(?:the\s+)?process\b/i,
  /\bre(?:activation|activated|consideration|considered)\b/i,
  /\breversal\b/i,
  /\bchanged\s+(?:our|their|the)\s+mind\b/i,
  /거절|불합격|종료\s*안내|프로세스\s*(?:종료|중단)|재연결|다시\s*연결|번복|재고/,
];

const OPERATIONAL_METADATA_PATTERNS = [
  /테스트\s*케이스|검증\s*과정|본인\s*계정|내부\s*(?:평가|검증|테스트)/i,
  /Slack|Gmail|E2E|end[- ]to[- ]end/i,
  /(?:시스템|서비스)\s*(?:흐름|연동)\s*(?:테스트|검증|확인)/i,
  /(?:추천|매칭)\s*(?:처리|검증|평가)\s*(?:과정|이력)/i,
];

const KOREAN_RECIPIENT_ROLE_LABEL_PATTERN = /후보자|담당자/;
const KOREAN_UNNATURAL_LANGUAGE_MIX_PATTERN = /\bfirm\b/i;

export function containsOrgIntroProcessHistory(value: string) {
  return PROCESS_HISTORY_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsOrgIntroOperationalMetadata(value: string) {
  return OPERATIONAL_METADATA_PATTERNS.some((pattern) => pattern.test(value));
}

export function getOrgIntroDraftSafetyIssues(args: {
  body: string;
  candidateName?: string;
  companyName?: string;
  companyUserName?: string;
  locale: "en" | "ko";
  subject: string;
}) {
  const combined = `${args.subject}\n${args.body}`;
  const issues: string[] = [];

  if (containsOrgIntroProcessHistory(combined)) {
    issues.push("company_process_history");
  }
  if (containsOrgIntroOperationalMetadata(combined)) {
    issues.push("operational_or_test_metadata");
  }
  if (
    args.locale === "ko" &&
    KOREAN_RECIPIENT_ROLE_LABEL_PATTERN.test(combined)
  ) {
    issues.push("recipient_role_label");
  }
  if (
    args.locale === "ko" &&
    KOREAN_UNNATURAL_LANGUAGE_MIX_PATTERN.test(combined)
  ) {
    issues.push("unnatural_korean_language_mix");
  }
  if (
    args.locale === "ko" &&
    args.candidateName &&
    args.companyName &&
    args.companyUserName
  ) {
    const companyPersonLabel = `${args.companyName}의 ${args.companyUserName}님`;
    const expectedGreeting = `${companyPersonLabel}, ${args.candidateName}님 안녕하세요.`;
    const companyPersonMentions =
      args.body.split(companyPersonLabel).length - 1;
    if (!args.body.startsWith(expectedGreeting)) {
      issues.push("invalid_recipient_greeting");
    }
    if (companyPersonMentions < 2) {
      issues.push("unqualified_company_person_reference");
    }
  }
  if (
    args.locale === "ko" &&
    !/이후 대화는 이 메일에서 이어가 주시면 됩니다\.\n\n감사합니다\.\nHarper 드림$/.test(
      args.body
    )
  ) {
    issues.push("invalid_exact_handoff_and_closing");
  }
  if (args.locale === "ko" && args.body.split(/\n{2,}/).length < 6) {
    issues.push("missing_readable_paragraph_structure");
  }

  return issues;
}
