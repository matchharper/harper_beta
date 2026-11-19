import { EXPLORE_SOURCE, signalSourceInfo } from "@/lib/gtmPlays/agent/signals";
import { excludeBucket, type AgentExcludeBucket } from "@/lib/gtmPlays/agent/funnel";
import {
  contactOutcome, stageOf, type AgentReached, type AgentStage, type ContactOutcome, type LogAfterFilter,
} from "@/lib/gtmPlays/agent/stage";
import type {
  AgentEventKind, AgentExcludeReason, AgentMethod, AgentPerson, AgentPostingKind, AgentStatus,
} from "@/lib/gtmPlays/agent/types";

/** Words on the agent screen (plain Korean, no code terms). */

/** Where the person was found: the source's own name (링크드인, OKKY, 네이버 블로그 …), else its domain. */
export function sourceLabel(source: string): string {
  if (source === EXPLORE_SOURCE) return "열린 웹";
  // Rows from before the per-domain sources (local tests): a Harper member, or a page on no known platform.
  if (source === "harper") return "하퍼 회원";
  if (source === "other") return "기타";
  try {
    return signalSourceInfo(source).label;
  } catch {
    return source;
  }
}

/** How the agent got to the person. */
export const METHOD_LABEL: Record<AgentMethod, string> = {
  applicant: "링크드인 지원 시작",
  open_to_work_profile: "구직 중 프로필",
  signal_post: "구직 글",
  layoff_company: "구조조정 회사 출신",
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  found: "찾음",
  excluded: "제외",
  no_fit: "맞는 회사 없음",
  matched: "공고 고름",
  drafted: "메일 씀",
  approved: "보낼 차례 기다림",
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
  stale_signal: "30일 지난 글",
  not_job_seeking: "이직 의사가 분명하지 않음",
  // No address the agent may mail, and why (agent/emailLookup.ts noEmailReason).
  no_lookup_source: "찾을 곳 없음",
  lookup_not_found: "찾아도 없음",
  lookup_other_person: "다른 사람 메일",
  lookup_skipped: "찾지 않음 (구직 신호 약함)",
  no_email: "이메일 없음",
};

/** Why a person is in 제외 on the numbers: the rule, or no fitting companies, left out by Ops, a failed send. */
export const EXCLUDE_BUCKET_LABEL: Record<AgentExcludeBucket, string> = {
  ...EXCLUDE_LABEL,
  no_fit: "맞는 회사가 없음",
  skipped: "직접 뺌",
  failed: "보내다 오류",
};

/** The stage words, the same as the numbers' columns (찾음 − 제외 − 연락 = 처리 중). */
export const STAGE_LABEL: Record<AgentStage, string> = {
  working: "처리 중", excluded: "제외", contacted: "연락", replied: "답장",
};

/** How far a mailed person got, in the numbers' words (회사 연결, 관심·지원, 가입, 클릭). */
export const CONTACT_OUTCOME_LABEL: Record<ContactOutcome, string> = {
  connected: "회사 연결",
  interested: "관심·지원",
  signed_up: "가입함",
  unsubscribed: "수신 거부함",
  bounced: "반송됨",
  clicked: "클릭함",
  ended: "후속 메일까지 보냄, 반응 없음",
  sent: "반응 없음",
};

/** The 메일 반응 filter: the numbers' column names, plus 반응 없음 · 수신 거부 · 반송. */
export const AFTER_FILTER_LABEL: Record<LogAfterFilter, string> = {
  none: "반응 없음", clicked: "클릭", signed_up: "가입", interested: "관심·지원", connected: "회사 연결",
  replied: "답장", unsubscribed: "수신 거부", bounced: "반송",
};

/** A handle from a profile link when the page shows one (/in/<id>, /@<id>, <id>.tistory.com, blog.naver.com/<id>). */
function handleOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    const at = parts.find((part) => part.startsWith("@"));
    if (at) return at;
    if (host.endsWith("linkedin.com") && parts[0] === "in" && parts[1]) return parts[1];
    if (["x.com", "twitter.com", "github.com", "blog.naver.com"].includes(host) && parts[0]) return parts[0];
    if (host.endsWith(".tistory.com")) return host.slice(0, -".tistory.com".length);
    return null;
  } catch {
    return null;
  }
}

/** Who a log line is about: the name, else the handle on their page, else the post's title (the headline). */
export function personName(person: { name?: string | null; profileUrl?: string | null; headline?: string | null }): {
  name: string; intro: string | null;
} {
  const headline = person.headline?.trim() || null;
  if (person.name?.trim()) return { name: person.name.trim(), intro: headline };
  const handle = handleOf(person.profileUrl);
  if (handle) return { name: handle, intro: headline };
  if (headline) return { name: headline, intro: null };
  return { name: "이름 없음", intro: null };
}

/**
 * Where a person stands: the stage word (the numbers' sets) and the step inside it ("처리 중 · 이메일 찾는 중",
 * "제외 · 맞는 회사가 2곳이 안 됨", "연락 · 클릭함", "답장 · 답장 옴", "답장 · 연락 그만 요청").
 */
export function personStage(person: Pick<AgentPerson, "status" | "excludeReason" | "emailLookup" | "email" | "events" | "sentAt" | "repliedAt"> & {
  reached?: AgentReached | null;
}): { stage: AgentStage; label: string; detail: string | null } {
  const stage = stageOf(person);
  const detail = ((): string | null => {
    // A reply that asked not to be contacted again (by Ops' button or found in the reply): the address is opted out.
    if (stage === "replied") return person.events.some((event) => event.kind === "unsubscribed") ? "연락 그만 요청" : "답장 옴";
    if (stage === "contacted") {
      return CONTACT_OUTCOME_LABEL[contactOutcome({ status: person.status, eventKinds: person.events.map((event) => event.kind), reached: person.reached })];
    }
    if (stage === "excluded") {
      const bucket = excludeBucket({ status: person.status, excludeReason: person.excludeReason, sentAt: null });
      return bucket ? EXCLUDE_BUCKET_LABEL[bucket] : null;
    }
    if (person.status === "drafted" || person.status === "approved") return "보낼 차례 기다림";
    // The paid lookup runs only for a matched person (2+ fitting postings); an older found one may still have one.
    if (person.status === "matched") return person.emailLookup?.state === "running" || !person.email ? "맞는 공고가 있어 이메일 찾는 중" : "공고 고르는 중";
    return person.emailLookup?.state === "running" ? "이메일 찾는 중" : "공고 고르는 중";
  })();
  return { stage, label: STAGE_LABEL[stage], detail };
}

export const POSTING_KIND_LABEL: Record<AgentPostingKind, string> = {
  external: "외부 공고",
  customer: "하퍼 고객사",
  gtm: "직접 넣은 공고",
};

export const EVENT_LABEL: Record<AgentEventKind, string> = {
  found: "찾음",
  excluded: "제외",
  no_fit: "맞는 회사 없음",
  matched: "공고 고름",
  drafted: "초안 씀",
  approved: "보낼 준비",
  rejected: "보내지 않기로 함",
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
  email_lookup: "이메일 찾기",
  profile: "프로필 읽기",
};

/** Korea-time weekdays (0 = Sunday) in the screen's order, Monday first. */
export const WEEKDAYS: ReadonlyArray<{ day: number; label: string }> = [
  { day: 1, label: "월" }, { day: 2, label: "화" }, { day: 3, label: "수" }, { day: 4, label: "목" },
  { day: 5, label: "금" }, { day: 6, label: "토" }, { day: 0, label: "일" },
];

/** The sending days in words: 평일, 매일, 주말, or the days (월·수·금). */
export function weekdaysLabel(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "매일";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((day) => set.has(day))) return "평일";
  if (set.size === 2 && set.has(0) && set.has(6)) return "주말";
  return WEEKDAYS.filter((item) => set.has(item.day)).map((item) => item.label).join("·") || "요일 없음";
}

/** "에이전트" for the agent, "운영팀" for a person (the timeline keeps the user id). */
export const byLabel = (by: string) => (by === "agent" ? "에이전트" : "운영팀");

export const usd = (value: number) => `$${(Math.round(value * 100) / 100).toFixed(2)}`;
