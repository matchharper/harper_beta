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
const CANDIDATE_DETRACTING_INFORMATION_PATTERNS = [
  /현재\s*(?:쉬|휴직)|쉬는\s*중|미재직|재직\s*중이\s*아니|경력\s*공백|공백기|실직|해고|권고\s*사직|퇴사\s*(?:사유|후)|구직\s*중|이직\s*준비\s*중/i,
  /\b(?:unemployed|jobless|between\s+(?:jobs|roles)|not\s+currently\s+(?:working|employed)|career\s+break|laid\s+off|fired|looking\s+for\s+work)\b/i,
];

export function containsOrgIntroProcessHistory(value: string) {
  return PROCESS_HISTORY_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsOrgIntroOperationalMetadata(value: string) {
  return OPERATIONAL_METADATA_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsOrgIntroCandidateDetractingInformation(value: string) {
  return CANDIDATE_DETRACTING_INFORMATION_PATTERNS.some((pattern) =>
    pattern.test(value)
  );
}

function escapeOrgIntroRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getOrgIntroDraftSafetyIssues(args: {
  body: string;
  candidateName?: string;
  companyName?: string;
  companyUserName?: string;
  companyUserRole?: string | null;
  locale: "en" | "ko";
  roleTitle?: string;
  subject: string;
}) {
  const combined = `${args.subject}\n${args.body}`;
  const issues: string[] = [];
  const koreanCompanyPersonPatternSource =
    args.locale === "ko" &&
    args.companyUserRole &&
    args.companyName &&
    args.companyUserName
      ? `${escapeOrgIntroRegex(args.companyName)}의\\s+[^,\\n]{1,160}?\\s+${escapeOrgIntroRegex(args.companyUserName)}님`
      : null;

  if (containsOrgIntroProcessHistory(combined)) {
    issues.push("company_process_history");
  }
  if (containsOrgIntroOperationalMetadata(combined)) {
    issues.push("operational_or_test_metadata");
  }
  if (containsOrgIntroCandidateDetractingInformation(args.body)) {
    issues.push("candidate_detracting_information");
  }
  if (
    args.locale === "ko" &&
    KOREAN_RECIPIENT_ROLE_LABEL_PATTERN.test(
      koreanCompanyPersonPatternSource
        ? combined.replace(
            new RegExp(koreanCompanyPersonPatternSource, "g"),
            `${args.companyName}의 ${args.companyUserName}님`
          )
        : combined
    )
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
    const hasExpectedGreeting = args.companyUserRole
      ? new RegExp(
          `^${koreanCompanyPersonPatternSource ?? "(?!)"}, ${escapeOrgIntroRegex(args.candidateName)}님 안녕하세요\\.`
        ).test(args.body)
      : args.body.startsWith(
          `${companyPersonLabel}, ${args.candidateName}님 안녕하세요.`
        );
    const companyPersonMentions = args.companyUserRole
      ? (args.body.match(
          new RegExp(koreanCompanyPersonPatternSource ?? "(?!)", "g")
        )?.length ?? 0)
      : args.body.split(companyPersonLabel).length - 1;
    if (!hasExpectedGreeting) {
      issues.push("invalid_recipient_greeting");
    }
    if (companyPersonMentions < 2) {
      issues.push("unqualified_company_person_reference");
    }
    if (args.companyUserRole && koreanCompanyPersonPatternSource) {
      const localizedRoles = [
        ...args.body.matchAll(
          new RegExp(
            `${escapeOrgIntroRegex(args.companyName)}의\\s+([^,\\n]{1,160}?)\\s+${escapeOrgIntroRegex(args.companyUserName)}님`,
            "g"
          )
        ),
      ].map((match) => match[1]?.trim());
      if (new Set(localizedRoles).size > 1) {
        issues.push("inconsistent_company_user_role");
      }
    }
  }
  if (args.candidateName && args.roleTitle) {
    const interestSentence =
      args.locale === "ko"
        ? `${args.candidateName}님은 ${args.roleTitle} 역할에 관심을 가져주셨습니다.`
        : `${args.candidateName} has expressed interest in the ${args.roleTitle} role.`;
    if (!args.body.includes(interestSentence)) {
      issues.push("missing_candidate_role_interest");
    }
  }
  if (
    args.locale === "en" &&
    args.candidateName &&
    args.companyName &&
    args.companyUserName
  ) {
    const companyRoleFragment = args.companyUserRole
      ? "([^,\\n]{1,160}?)\\s+"
      : "";
    const englishGreetingPattern = new RegExp(
      `^Hi ${escapeOrgIntroRegex(args.companyName)}'s\\s+${companyRoleFragment}${escapeOrgIntroRegex(args.companyUserName)} and ${escapeOrgIntroRegex(args.candidateName)},`
    );
    const englishCompanyIntroPattern = new RegExp(
      `${escapeOrgIntroRegex(args.candidateName)}, I'd like to introduce ${escapeOrgIntroRegex(args.companyName)}'s\\s+${companyRoleFragment}${escapeOrgIntroRegex(args.companyUserName)}\\.`
    );
    const englishGreetingMatch = args.body.match(englishGreetingPattern);
    const englishCompanyIntroMatch = args.body.match(
      englishCompanyIntroPattern
    );
    if (!englishGreetingMatch) {
      issues.push("invalid_recipient_greeting");
    }
    if (!englishCompanyIntroMatch) {
      issues.push("missing_company_user_role_introduction");
    }
    if (args.companyUserRole && englishGreetingMatch) {
      const localizedGreetingRole = englishGreetingMatch[1]?.trim() ?? "";
      const localizedIntroRole = englishCompanyIntroMatch?.[1]?.trim() ?? "";
      if (/[\uac00-\ud7a3]/.test(localizedGreetingRole + localizedIntroRole)) {
        issues.push("unlocalized_company_user_role");
      }
      if (localizedIntroRole && localizedGreetingRole !== localizedIntroRole) {
        issues.push("inconsistent_company_user_role");
      }
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
  if (args.body.split(/\n{2,}/).length < 6) {
    issues.push("missing_readable_paragraph_structure");
  }

  return issues;
}
