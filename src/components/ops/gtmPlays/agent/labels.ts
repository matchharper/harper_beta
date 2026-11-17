import type {
  AgentChannel, AgentEventKind, AgentExcludeReason, AgentPostingKind, AgentSource, AgentStatus,
} from "@/lib/gtmPlays/agent/types";

/** #5 screen words (plain Korean, no code terms). */

export const SOURCE_LABEL: Record<AgentSource, string> = {
  recruiter: "링크드인 지원자",
  opentowork: "#OpenToWork 글",
  threads: "Threads 이직 글",
  manual: "직접 넣음",
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  found: "찾음",
  excluded: "제외",
  no_fit: "맞는 회사 없음",
  matched: "공고 고름",
  drafted: "초안",
  approved: "승인됨",
  sent: "연락함",
  queued_human: "사람이 보낼 차례",
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
  no_contact: "연락할 방법 없음",
};

export const CHANNEL_LABEL: Record<AgentChannel, string> = {
  email: "메일",
  linkedin: "링크드인",
  x: "X",
  threads: "Threads",
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
  queued_human: "사람이 보낼 목록에 올림",
  sent_by_hand: "사람이 보냄",
  skipped: "건너뜀",
  expired: "기한 지남",
  clicked: "링크 클릭",
  signed_up: "가입",
  replied: "답장 옴",
  unsubscribed: "연락 그만",
  bounced: "반송",
  followup_drafted: "후속 메시지 초안",
  followup_sent: "후속 메시지 보냄",
  ended: "끝남",
  failed: "실패",
  note: "메모",
};

export const PROFILE_BUTTON: Record<Exclude<AgentChannel, "email">, string> = {
  linkedin: "링크드인에서 열기",
  x: "X에서 열기",
  threads: "Threads에서 열기",
};

/** "에이전트" for the agent, "Ops" for a person (the timeline keeps the user id). */
export const byLabel = (by: string) => (by === "agent" ? "에이전트" : "Ops");

export const usd = (value: number) => `$${(Math.round(value * 100) / 100).toFixed(2)}`;
