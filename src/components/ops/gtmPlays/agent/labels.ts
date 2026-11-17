import type {
  AgentCandidateSource, AgentEventKind, AgentExcludeReason, AgentMethod, AgentPostingKind, AgentStatus,
} from "@/lib/gtmPlays/agent/types";

/** #5 screen words (plain Korean, no code terms). */

/** Where the person was found (by domain). A source not listed here shows its own id (its domain). */
export const SOURCE_LABEL: Record<string, string> = {
  linkedin: "링크드인",
  x: "X",
  threads: "Threads",
  github: "GitHub",
  harper: "하퍼 회원",
  other: "기타",
};

export const sourceLabel = (source: string) => SOURCE_LABEL[source] ?? source;

/** How the agent got to the person. */
export const METHOD_LABEL: Record<AgentMethod, string> = {
  applicant: "링크드인 지원 시작",
  signal: "구직 글·프로필",
  layoff: "구조조정 회사",
  role: "Role로 찾기",
};

/** Where a Role run found the person (as #4's Choice 1 · 2 · 3). */
export const CANDIDATE_SOURCE_LABEL: Record<AgentCandidateSource, string> = {
  member: "하퍼 회원",
  external: "외부 검색",
  scraped: "스크랩 DB",
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  found: "찾음",
  excluded: "제외",
  no_fit: "맞는 회사 없음",
  matched: "공고 고름",
  drafted: "초안",
  approved: "승인됨",
  sent: "연락함",
  skipped: "건너뜀",
  replied: "답장 옴",
  ended: "끝남",
  failed: "실패",
};

export const EXCLUDE_LABEL: Record<AgentExcludeReason, string> = {
  member: "이미 하퍼 회원",
  recent_contact: "30일 안에 연락함",
  quiet_after_end: "끝난 뒤 쉬는 기간",
  suppressed: "수신 거부·반송",
  internal: "하퍼 직원·테스트 주소",
  duplicate: "같은 사람 중복",
  stale_signal: "14일 지난 글",
  not_job_seeking: "이직 의사가 분명하지 않음",
  company_intro: "회사가 이미 이 Role로 만난 사람",
  no_email: "보낼 수 있는 메일 주소 없음",
};

export const POSTING_KIND_LABEL: Record<AgentPostingKind, string> = {
  external: "외부 공고",
  customer: "하퍼 고객사",
  gtm: "JD 붙여넣기",
};

export const EVENT_LABEL: Record<AgentEventKind, string> = {
  found: "찾음",
  excluded: "제외",
  no_fit: "맞는 회사 없음",
  matched: "공고 고름",
  drafted: "초안 씀",
  approved: "승인",
  rejected: "승인 안 함",
  sent: "메일 보냄",
  skipped: "건너뜀",
  expired: "기한 지남",
  clicked: "링크 클릭",
  signed_up: "가입",
  replied: "답장 옴",
  unsubscribed: "연락 그만",
  bounced: "반송",
  followup_sent: "후속 메일 보냄",
  ended: "끝남",
  failed: "실패",
  note: "메모",
};

/** "에이전트" for the agent, "Ops" for a person (the timeline keeps the user id). */
export const byLabel = (by: string) => (by === "agent" ? "에이전트" : "Ops");

export const usd = (value: number) => `$${(Math.round(value * 100) / 100).toFixed(2)}`;
