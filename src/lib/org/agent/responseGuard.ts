import {
  COMPANY_DATA_KEYS,
  companyDataDisplayLabel,
} from "@/lib/org/agent/companyDataCatalog";
import { ORG_AGENT_TOOL_NAMES } from "@/lib/org/agent/tools";

type Replacement = { en: string; ko: string };

const TOKEN_REPLACEMENTS: Record<string, Replacement> = {
  accepted: { en: "accepted internally", ko: "내부 수락" },
  active: { en: "actively hiring", ko: "채용 중" },
  append: { en: "add", ko: "추가" },
  archived: { en: "archived", ko: "보관됨" },
  baseProposalId: { en: "the current draft change", ko: "현재 변경안" },
  company_agent_update_proposals: {
    en: "pending changes",
    ko: "확인 대기 변경안",
  },
  company_conversation_summaries: {
    en: "conversation summaries",
    ko: "대화 요약",
  },
  company_data: { en: "company information", ko: "회사 정보" },
  company_db: { en: "company source information", ko: "회사 원본 정보" },
  company_events: { en: "change history", ko: "변경 기록" },
  company_internal_roles: {
    en: "internal position information",
    ko: "내부 포지션 정보",
  },
  company_memories: { en: "company notes", ko: "회사 메모" },
  company_workspace: { en: "company workspace", ko: "회사 워크스페이스" },
  connected: { en: "connected", ko: "연결됨" },
  contract: { en: "contract", ko: "계약직" },
  custom: { en: "company-defined stage", ko: "회사 지정 단계" },
  ended: { en: "hiring ended", ko: "채용 종료" },
  final_offer: { en: "final offer stage", ko: "최종 오퍼 단계" },
  full_time: { en: "full-time", ko: "정규직" },
  get_more_data: { en: "additional information lookup", ko: "추가 정보 조회" },
  get_talents: { en: "candidate search", ko: "후보 검색" },
  hybrid: { en: "hybrid work", ko: "하이브리드 근무" },
  internship: { en: "internship", ko: "인턴" },
  on_site: { en: "office-based work", ko: "오피스 근무" },
  onsite: { en: "office-based work", ko: "오피스 근무" },
  org_note: { en: "company note", ko: "회사 메모" },
  org_stage_change: { en: "hiring stage change", ko: "채용 단계 변경" },
  part_time: { en: "part-time", ko: "파트타임" },
  paused: { en: "hiring paused", ko: "채용 일시 중지" },
  pending_connection: { en: "awaiting connection", ko: "연결 대기" },
  pending_opportunities: {
    en: "candidates under review",
    ko: "검토 중인 후보",
  },
  process_stopped: { en: "process ended", ko: "프로세스 종료" },
  proposalAction: { en: "change decision", ko: "변경안 처리" },
  proposalId: { en: "the pending change", ko: "확인 대기 변경안" },
  recommendationId: {
    en: "candidate recommendation identifier",
    ko: "후보 추천 식별자",
  },
  remote: { en: "remote work", ko: "원격 근무" },
  read_role: { en: "position details lookup", ko: "포지션 상세 조회" },
  read_talent: { en: "candidate details lookup", ko: "후보 상세 조회" },
  replace: { en: "edit part", ko: "부분 수정" },
  rewrite: { en: "replace all", ko: "전체 수정" },
  roleId: { en: "position identifier", ko: "포지션 식별자" },
  talentId: { en: "candidate identifier", ko: "후보자 식별자" },
  top_priority: {
    en: "highest-priority hiring",
    ko: "최우선 채용",
  },
  update_data: { en: "information update function", ko: "정보 수정 기능" },
};

for (const key of COMPANY_DATA_KEYS) {
  if (!key.includes("_")) continue;
  TOKEN_REPLACEMENTS[key] ??= {
    en: key.replaceAll("_", " "),
    ko: companyDataDisplayLabel(key),
  };
}
for (const toolName of ORG_AGENT_TOOL_NAMES) {
  TOKEN_REPLACEMENTS[toolName] ??= {
    en: "the relevant function",
    ko: "관련 기능",
  };
}

const CAMEL_CASE_INTERNAL_TOKENS = [
  "baseProposalId",
  "proposalAction",
  "proposalId",
  "recommendationId",
  "roleId",
  "talentId",
] as const;

const UUID_EXACT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLACK_ID_EXACT_PATTERN = /^[UWBCDG][A-Z0-9]{8,}$/;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenPattern(token: string) {
  return new RegExp(
    `(?<![A-Za-z0-9_])${escapeRegExp(token)}(?![A-Za-z0-9_])`,
    "g"
  );
}

function containsToken(value: string, token: string) {
  return tokenPattern(token).test(value);
}

function findSnakeCaseTokens(value: string) {
  return value.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [];
}

function findUuids(value: string) {
  return (
    value.match(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
    ) ?? []
  );
}

function findSlackIds(value: string) {
  return value.match(/\b[UWBCDG][A-Z0-9]{8,}\b/g) ?? [];
}

export function findNewOrgAgentInternalTokens(args: {
  reply: string;
  userMessage: string;
}) {
  const candidates = [
    ...Object.keys(TOKEN_REPLACEMENTS).filter((token) =>
      containsToken(args.reply, token)
    ),
    ...findSnakeCaseTokens(args.reply),
    ...CAMEL_CASE_INTERNAL_TOKENS.filter((token) =>
      containsToken(args.reply, token)
    ),
  ];
  return Array.from(new Set(candidates))
    .filter((token) => !containsToken(args.userMessage, token))
    .sort(
      (left, right) => args.reply.indexOf(left) - args.reply.indexOf(right)
    );
}

export function findNewOrgAgentInternalArtifacts(args: {
  reply: string;
  userMessage: string;
}) {
  const tokens: string[] = [...findNewOrgAgentInternalTokens(args)];
  const userAskedForId = /\b(?:id|uuid)\b|아이디|식별자/i.test(
    args.userMessage
  );
  if (!userAskedForId) {
    for (const id of [...findUuids(args.reply), ...findSlackIds(args.reply)]) {
      if (!args.userMessage.toLowerCase().includes(id.toLowerCase())) {
        tokens.push(id);
      }
    }
  }
  return Array.from(new Set(tokens));
}

function replacementForToken(token: string, korean: boolean) {
  const known = TOKEN_REPLACEMENTS[token];
  if (known) return korean ? known.ko : known.en;
  if (token.includes("_")) {
    return korean ? "내부 용어" : token.replaceAll("_", " ");
  }
  return korean ? "내부 항목" : "internal field";
}

export function replaceNewOrgAgentInternalTokens(args: {
  reply: string;
  userMessage: string;
}) {
  const korean = /[가-힣]/.test(args.userMessage);
  const withoutTokens = findNewOrgAgentInternalTokens(args)
    .sort((left, right) => right.length - left.length)
    .reduce(
      (reply, token) =>
        reply.replace(tokenPattern(token), replacementForToken(token, korean)),
      args.reply
    );
  const leakedIds = findNewOrgAgentInternalArtifacts({
    reply: withoutTokens,
    userMessage: args.userMessage,
  }).filter(
    (artifact) =>
      UUID_EXACT_PATTERN.test(artifact) || SLACK_ID_EXACT_PATTERN.test(artifact)
  );
  const hiddenId = korean ? "내부 식별자" : "internal identifier";
  return leakedIds.reduce(
    (reply, id) => reply.replace(tokenPattern(id), hiddenId),
    withoutTokens
  );
}

const CANDIDATE_COMPENSATION_QUESTION_PATTERN =
  /연봉|급여|보상|희망\s*금액|salary|compensation|pay\s*(?:range|expectation)|current\s*pay/i;

/**
 * Compensation is a server-enforced disclosure boundary. A company question
 * never receives a stored amount (or even a confirmation that one exists)
 * until the candidate answers the scoped request.
 */
export function guardOrgAgentCandidatePrivacyReply(args: {
  preferenceDisclosure?: {
    attempted: boolean;
    evidence: string[];
  };
  reply: string;
  toolResults: Array<{ name: string; status: string }>;
  userMessage: string;
}) {
  if (!CANDIDATE_COMPENSATION_QUESTION_PATTERN.test(args.userMessage)) {
    const disclosure = args.preferenceDisclosure;
    if (!disclosure?.attempted) return args.reply;

    const evidence = disclosure.evidence
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    const reply = args.reply;
    const containsRawEvidence = evidence.some(
      (item) => item.length >= 24 && reply.includes(item)
    );
    const negativeOrConflicting = evidence.some((item) =>
      /싫|원하지\s*않|피하고|선호하지\s*않|not\s+(?:want|prefer)|avoid|against/i.test(
        item
      )
    );
    const replyExposesNegative =
      /싫어|원하지\s*않|피하고\s*있|선호하지\s*않|doesn'?t\s+want|does\s+not\s+prefer|avoids?/i.test(
        reply
      );
    const evidenceIsOpenOnly =
      evidence.length > 0 &&
      evidence.every((item) =>
        /열려|고려\s*(?:가능|할 수)|open\s+to|would\s+consider|can\s+consider/i.test(
          item
        )
      );
    const replyStrengthensPreference =
      /적극|우선적|가장\s*(?:먼저|원)|원하고|찾고\s*있|actively|priority|specifically\s+wants?|is\s+seeking/i.test(
        reply
      );
    const infersConditionAwareness =
      /(?:추천|기회).{0,40}(?:수락|오케이|OK).{0,60}(?:조건|규모|단계).{0,30}(?:알|이해|확인)|(?:조건|규모|단계).{0,50}(?:알|이해|확인).{0,40}(?:수락|오케이|OK)/i.test(
        reply
      );

    if (
      evidence.length === 0 ||
      containsRawEvidence ||
      negativeOrConflicting ||
      replyExposesNegative ||
      (evidenceIsOpenOnly && replyStrengthensPreference) ||
      infersConditionAwareness
    ) {
      return /[가-힣]/.test(args.userMessage)
        ? "현재 확인된 선호만으로는 이 조건을 적극적으로 원한다고 확답하기 어려워요. 이번 기회를 별도로 긍정적으로 보신 이유가 있을 수 있으니, 원하시면 후보자분께 부담 없게 확인하고 답이 오면 전달드리겠습니다."
        : "The current preference evidence is not strong enough to confirm that the candidate actively wants this exact condition. If you would like, I can ask them without pressure and relay any response.";
    }
    return reply;
  }
  const contactAttempt = args.toolResults.find(
    (result) => result.name === "contact_talent"
  );
  if (contactAttempt) return args.reply;
  return /[가-힣]/.test(args.userMessage)
    ? "보상 정보는 후보자 확인 없이 먼저 공유하지 않고 있어요. 원하시면 현재 생각하는 금액을 그대로 전달해도 되는지, 범위나 다른 표현으로 전달하길 원하는지 후보자분께 확인하겠습니다."
    : "Harper does not share compensation information without checking with the candidate first. If you would like, I can ask whether they want their current figure shared as-is, as a range, or in different wording.";
}
