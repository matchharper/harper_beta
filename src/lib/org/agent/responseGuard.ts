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
  change_role_status: {
    en: "position status change function",
    ko: "포지션 상태 변경 기능",
  },
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
const ORG_AGENT_NAVIGATION_MARKER_PATTERN =
  /\[([^\]\r\n]+)\]\((?:talent|role):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)/gi;

function withoutOrgAgentNavigationMarkers(value: string) {
  return value.replace(ORG_AGENT_NAVIGATION_MARKER_PATTERN, "$1");
}

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
  const replyForInspection = withoutOrgAgentNavigationMarkers(args.reply);
  const candidates = [
    ...Object.keys(TOKEN_REPLACEMENTS).filter((token) =>
      containsToken(replyForInspection, token)
    ),
    ...findSnakeCaseTokens(replyForInspection),
    ...CAMEL_CASE_INTERNAL_TOKENS.filter((token) =>
      containsToken(replyForInspection, token)
    ),
  ];
  return Array.from(new Set(candidates))
    .filter((token) => !containsToken(args.userMessage, token))
    .sort(
      (left, right) =>
        replyForInspection.indexOf(left) - replyForInspection.indexOf(right)
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
    const replyForInspection = withoutOrgAgentNavigationMarkers(args.reply);
    for (const id of [
      ...findUuids(replyForInspection),
      ...findSlackIds(replyForInspection),
    ]) {
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
