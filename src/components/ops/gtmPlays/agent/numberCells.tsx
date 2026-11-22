import type { ReactNode } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { shortConfigId } from "@/lib/gtmPlays/agent/config";
import type { AgentDayRun } from "@/lib/gtmPlays/agent/daily";
import type { AgentExcludeBucket, AgentFunnelNumbers } from "@/lib/gtmPlays/agent/funnel";
import { periodDayLabel } from "@/lib/gtmPlays/agent/period";
import type { AgentSpendStep } from "@/lib/gtmPlays/agent/spend";
import { Hint } from "../ui";
import { configChangesOf, useAgentConfigs } from "./AgentConfig";
import { EXCLUDE_BUCKET_LABEL, usd } from "./labels";

/**
 * The pieces every #5 number table shares (Shaun 11/17: the same words and the same look for the same thing): the
 * column hints, the header with its ⓘ, a count with its %, a number that opens its people, the cost cards, the
 * segmented buttons, and the 날짜 rows' words.
 */

/** What each number counts (ⓘ), with the formula where a % is shown. */
export const FUNNEL_HINTS = {
  source: "그 사람을 찾은 곳이에요. 링크드인에는 올린 지원자 파일과 링크드인에서 찾은 구직 글·프로필이 같이 들어가요. 어떻게 찾았는지는 아래 로그의 '찾은 사람'에 있어요.",
  found: "고른 기간에 에이전트가 찾은 사람 수예요(같은 사람은 한 번만). 찾음 = 처리 중 + 제외 + 연락이에요. 처리 중은 아직 이메일을 찾거나 공고를 고르는 중이거나 보낼 차례를 기다리는 사람이라 표에 따로 없어요(로그의 '처리 중'에서 보여요).",
  excluded: "연락하지 않기로 한 사람이에요: 이미 하퍼 회원, 30일 안에 이미 연락함, 수신 거부·반송, 30일 지난 글, 보낼 이메일이 없음, 맞는 회사가 없음, 직접 뺌, 보내다 오류. 이메일이 없는 사람은 이유를 나눠 보여요: 찾을 곳 없음(이메일을 찾아볼 프로필·링크가 없음), 찾아도 없음(이메일 찾기로도 못 찾음), 다른 사람 메일(찾은 주소가 그 사람 것이 아님), 이메일 없음(그 밖). 숫자에 마우스를 올리면 이유별로 보여요. 로그의 '제외'와 같아요.",
  contacted: "메일이 나간 사람이에요(답장한 사람도 포함). %는 연락 ÷ 찾음이에요. 로그의 '연락'과 같아요.",
  clicked: "메일의 하퍼 링크를 열어 페이지를 1초 넘게 본 사람이에요(가입한 사람도 포함). %는 클릭 ÷ 연락이에요.",
  signedUp: "그 링크로 하퍼 계정을 만든 사람이에요(온보딩 제출 전이어도 세요). 이미 계정이 있던 사람은 그 링크로 공고를 받으면 세요. 괄호 안은 가입률 = 가입 ÷ 연락이에요. 예: 50명에게 보내 2명이 가입하면 4%예요.",
  interested: "메일로 제안한 공고를 저장하거나 지원한 사람이에요(그 뒤 연결·오퍼·합격까지 포함).",
  connected: "제안한 공고의 회사와 하퍼에서 연결된 사람이에요. 가장 중요한 숫자예요.",
  replied: "연락한 사람 중 답장한 사람이에요. 답장은 연결된 팀 메일함에서 자동으로 찾고(자동응답·반송은 빼요), 운영팀이 '답장 옴'을 눌러 남길 수도 있어요. 괄호 안은 답장률 = 답장 ÷ 연락이에요. 예: 50명에게 보내 5명이 답하면 10%예요. 로그의 '답장'과 같아요.",
  ashleyReplied: "Ashley 답장이 한 통 이상 나간 사람이에요.",
  noReply: "Ashley가 답장에 답하지 않기로(연락 그만 포함) 한 사람이에요. 숫자에 마우스를 올리면 마지막 판단의 이유별로 보여요.",
  handedOff: "Ashley가 답하지 않고 운영팀 사람에게 넘긴 메일이 있는 사람이에요: 봇인지·사람인지 묻거나, 가격·법률 문의처럼 Ashley가 답하지 않는 메일이거나, Ashley가 쓴 답장이 보내기 전 점검에 걸렸거나 보내지 못한 경우예요. 로그의 메일 반응 '사람에게 넘김'과 같아요.",
  signedUpAfterReply: "답장한 뒤 가입한 사람이에요.",
  delivery: "연락한 사람 중 반송(주소가 없거나 받지 못함) / 스팸 신고 / 수신 거부(메일의 '연락 받지 않기'를 누르거나 그만 보내 달라고 답장함)한 사람 수예요. 스팸 신고가 최근 7일 2건이면 에이전트가 스스로 꺼져요. 사람은 로그의 '메일 반응'에서 반송·수신 거부로 볼 수 있어요. Gmail은 스팸 신고를 한 건씩 알려 주지 않아서, 이 신고 수에는 Gmail 신고가 빠져 있어요. 그래서 합계 줄 아래에 Google Postmaster Tools가 주는 Gmail 스팸 비율(가장 최근 날)을 같이 보여 줘요. 보내는 도메인으로 나간 메일 전부(하퍼 서비스 메일 포함)를 센 값이고, 보통 1~2일 늦게 나와요. Gmail로 간 메일이 적은 날은 숫자가 없어요. Google은 0.1% 아래를 권하고 0.3%를 넘지 말라고 해요. 0.1% 이상이면 빨갛게 보여요.",
  cost: "그 사람들을 찾고(검색), 이메일을 찾고, 공고를 고르고, 메일을 쓰는 데 쓴 돈이에요. 검색 비용은 그 사이트 줄에 들어가요. 마우스를 올리면 단계별로 보여요.",
} as const;

/** The columns of the 날짜 rows and of 검색 수율 and 추천 품질 (ⓘ); the rest are FUNNEL_HINTS. */
export const DAY_HINTS = {
  day: "에이전트가 그 사람을 찾은 날(한국 시간)이에요. 그날 찾은 사람이 그 뒤 어떻게 됐는지 세요. 그래서 최근 날짜의 클릭·가입·답장은 며칠 더 늘어날 수 있어요. 검색 수율은 검색한 날로 세요. 날짜를 모두 더하면 합계와 같아요.",
  run: "그날 에이전트가 검색한 곳(사이트 수, 목록 밖 웹은 한 곳)과 올린 지원자 파일 수예요. 하루 비용 한도에 닿아 건너뛴 곳은 따로 적어요. 아무것도 없으면 '실행 없음'이에요(꺼져 있었거나 실행되지 않음).",
  lookup: "찾은 사람 중 페이지나 파일에 이메일이 없어서 돈을 내고(한 번에 약 $0.10) 찾아본 사람 수와(뒤 숫자), 그중 쓸 수 있는 이메일을 찾은 사람 수예요(앞 숫자). %는 찾음 ÷ 찾아봄이에요. 못 찾으면 제외(이메일 없음)가 돼요.",
  cost: "그날 한 검색 비용 + 그날 찾은 사람의 이메일 찾기·공고 고르기·따로 채점·메일 쓰기 비용이에요. 마우스를 올리면 단계별로 보여요. 날짜를 모두 더하면 합계 비용과 같아요.",
  perContact: "비용 ÷ 연락이에요. 메일 한 통을 보내기까지 든 돈이에요. 예: $5를 써서 10명에게 보냈으면 $0.50이에요.",
  searches: "검색한 횟수예요. 검색어 하나를 한 번 돌리면 한 번이고, 사이트마다 여러 번 검색해요. 누르면 그 검색 기록을 보여 줘요.",
  known: "검색에서 에이전트가 '본인이 새 일을 찾고 있다'고 판단했지만, 전에 이미 찾은 사람이라 다시 넣지 않은 사람 수예요. 사람마다 따로 남지 않아서, 누르면 그 검색 기록을 보여 줘요.",
  withAddress: "찾은 사람 중 메일을 보낼 수 있는 주소가 있는 사람이에요(페이지나 파일에 있는 주소, 또는 이메일 찾기로 찾은 주소). 괄호 안은 연락 가능 ÷ 찾음이에요. 예: 20명을 찾아 15명에게 주소가 있으면 75%예요. 누르면 그 줄의 찾은 사람을 보여 줘요.",
  perWithAddress: "검색 비용 ÷ 검색으로 찾은 사람 중 연락 가능한 사람이에요(지원자 파일로 올린 사람은 검색 비용이 들지 않아 빼요). 예: 검색에 $3을 써서 주소가 있는 새 사람 30명을 찾았으면 $0.10이에요.",
  // kept · fresh · contactable · perContactable: 하루별 성능 (AgentDailyTable) only, until 수치 · 후보 replaces it.
  kept: "검색 결과 중 에이전트가 '본인이 새 일을 찾고 있다'고 판단해 남긴 사람이에요. 이미 전에 찾은 사람도 들어가요.",
  fresh: "검색에서 처음 찾은 사람이에요(지원자 파일은 빼요). 검색한 날로 세요. %는 처음 찾음 ÷ 남긴 사람이고, 나머지는 전에 이미 찾은 사람이에요. 예: 10명을 남겨 4명이 처음이면 40%예요.",
  contactable: "처음 찾은 사람 중 메일을 보낼 수 있는 주소가 있는 사람이에요(페이지에 본인이 쓴 주소, 또는 이메일 찾기로 찾은 주소). %는 연락 가능 ÷ 처음 찾음이에요.",
  searchCost: "검색에 쓴 돈이에요(검색 + 결과 판단). 이메일 찾기 비용은 빼요.",
  perContactable: "검색 비용 ÷ 연락 가능이에요. 메일을 보낼 수 있는 새 사람 한 명을 검색으로 찾는 데 든 돈이에요.",
  sentPostings: "그 사람들에게 실제로 나간 메일에 담긴 공고 수예요(한 통에 2~3개). 눌러서 그 사람들을 볼 수 있어요.",
  score: "에이전트가 공고를 고를 때 매긴 적합 점수(0~100)의 평균이에요. 높을수록 그 사람과 잘 맞는다고 본 공고예요. 점수를 남기기 전에 고른 공고는 빼고 계산해요.",
  graded: "공고를 고른 바로 뒤에, 고를 때와 다른 더 엄격한 기준으로 한 번 더 채점한 결과예요. 직무와 연차가 맞는지, 꼭 필요한 조건이 빠지지 않았는지, 근무 지역·원격 근무, 업계 경험을 봐요. %는 잘 맞음 ÷ 채점한 공고예요. 지금은 재기만 하고, 결과와 상관없이 메일은 그대로 나가요.",
  verdict: "운영팀이 로그에서 사람을 열어 공고마다 누른 '맞음 / 안 맞음' 수예요. 일치는 따로 채점이 '잘 맞음'이나 '안 맞음'이라고 한 공고 중 운영팀 판단과 같은 비율이에요('애매'는 빼요).",
  config: "에이전트가 그때 쓴 설정 전체(찾는 곳과 기준, 보내기·비용, 코드에 정한 규칙, AI에게 주는 지침, 프로그램 버전)에 붙인 번호예요. 하나라도 바뀌면 새 번호가 생겨요. 하나를 고르면 그 설정 묶음으로 찾은 사람과 그 설정 묶음으로 한 검색만 세서, 설정 묶음끼리 비교할 수 있어요. 날짜 옆 표시는 그날 새 설정 묶음을 처음 쓴 날이에요.",
} as const;

export function HeaderLabel({ label, hint, align = "right" }: { label: string; hint: string; align?: "left" | "right" }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap", align === "right" ? "justify-end" : "justify-start")}>
      {align === "right" ? <Hint label={label} text={hint} /> : null}
      {label}
      {align === "right" ? null : <Hint label={label} text={hint} />}
    </span>
  );
}

export function Count({ n, rate, title, strong }: { n: number; rate?: number | null; title?: string; strong?: boolean }) {
  return (
    <span className="whitespace-nowrap tabular-nums" title={title}>
      <span className={strong ? "font-medium" : undefined}>{n}</span>
      {rate !== undefined && rate !== null ? <span className="ml-1 text-[11px] text-neutral-muted">· {rate}%</span> : null}
    </span>
  );
}

export const excludedTitle = (by: AgentFunnelNumbers["excludedBy"]) => Object.entries(by)
  .map(([reason, count]) => `${EXCLUDE_BUCKET_LABEL[reason as AgentExcludeBucket] ?? reason} ${count}`).join(" · ") || undefined;

/** 답 안 함's hover: the reason labels (agent/conversationView.ts decisionReasonLabel), most first. */
export const noReplyTitle = (by: AgentFunnelNumbers["noReplyBy"]) => Object.entries(by)
  .sort(([, a], [, b]) => b - a).map(([reason, count]) => `${reason} ${count}`).join(" · ") || undefined;

/** A number that opens what it counts (its people in the log, or its searches). */
export function NumberCell({ onClick, children, title }: { onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <td className="px-2 py-1.5 text-right align-top">
      <button type="button" title={title ?? "눌러서 이 사람들 보기"} onClick={onClick} className="whitespace-nowrap rounded px-1 tabular-nums hover:bg-bg-weak hover:underline">
        {children}
      </button>
    </td>
  );
}

/** A cost as the other ops pages show a key number (/ops/jobs 방문자): a small label with ⓘ, the value large. */
export function CostStat({ label, hint, value, note, alert }: { label: string; hint: string; value: string; note?: string; alert?: boolean }) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-3 py-2")}>
      <div className="flex items-center gap-1 text-xs text-neutral-soft">
        {label}
        <Hint label={label} text={hint} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cx("text-base font-semibold tabular-nums", alert ? "text-critical" : "text-neutral-primary")}>{value}</span>
        {note ? <span className="text-xs tabular-nums text-neutral-muted">{note}</span> : null}
      </div>
    </div>
  );
}

export const PERIOD_COST_HINT = "고른 기간(한국 시간 날짜) 동안 쓴 돈이에요: 사람 찾기 검색 + 이메일 찾기 + 공고 고르기 + 메일 쓰기.";
export const TODAY_COST_HINT = "오늘(한국 시간) 쓴 돈이에요. Ashley 답장에 든 돈은 한도에 넣지 않아서 빼고 세요. 한도에 닿으면 그날은 찾기·보내기를 멈춰요. 한도는 설정에서 바꿔요.";

/** The segmented buttons of the #5 tables (one of a few views). */
export function Segmented<T extends string>({ items, value, onChange, label }: {
  items: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (value: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-neutral-1000-a05 text-[12px]">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
          className={cx("whitespace-nowrap px-3 py-1", value === item.id ? "bg-bg-weak font-medium text-neutral-primary" : "text-neutral-muted hover:bg-bg-weak/70")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 날짜 rows

const STEP_LABEL: Record<AgentSpendStep, string> = {
  search: "검색", profile: "프로필 읽기", lookup: "이메일 찾기", match: "공고 고르기", review: "따로 채점", compose: "메일 쓰기",
  followup: "후속 메일", reply: "Ashley 답장",
};
const STEP_ORDER: AgentSpendStep[] = ["search", "profile", "lookup", "match", "review", "compose", "followup", "reply"];

/** A 비용 cell's hover: the cost by step. */
export const costTitle = (costBy: Partial<Record<AgentSpendStep, number>>) => STEP_ORDER
  .filter((step) => costBy[step])
  .map((step) => `${STEP_LABEL[step]} ${usd(costBy[step] ?? 0)}`).join(" · ") || "쓴 돈이 없어요";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "11. 17. (월)", with the year when it is not this year. */
export function dayLabel(day: string, today: string) {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${periodDayLabel(day, today.slice(0, 4))} (${weekday})`;
}

/** The 그날 실행 cell's hover: what the day's searches did. */
export function runTitle(run: AgentDayRun): string | undefined {
  if (!run.searchedSources) return undefined;
  return `검색어 ${run.searches}번 · 새로 찾은 사람 ${run.newPeople}명 · 이미 아는 사람 ${run.knownPeople}명`;
}

/** What the day's runs did in words, or null when they did nothing (agent/numbers.ts ranOn). */
export function runText(run: AgentDayRun): string | null {
  const parts = [
    run.searchedSources ? `검색 ${run.searchedSources}곳` : null,
    run.files ? `파일 ${run.files}개` : null,
    run.skippedBudget ? `예산이 없어 ${run.skippedBudget}곳 건너뜀` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** "새 설정 묶음 #3fa9c" on the day it was first used: what changed on hover, a click shows only its numbers. */
export function ConfigStarts({ ids, onConfig }: { ids: readonly string[]; onConfig: (id: string) => void }) {
  const configs = useAgentConfigs();
  if (!ids.length) return null;
  return (
    <>
      {ids.map((id) => {
        const config = configs.find((item) => item.id === id);
        const { previous, changes } = config ? configChangesOf(configs, config) : { previous: null, changes: [] };
        const title = !previous ? "처음 쓴 설정 묶음이에요" : changes.length
          ? `바로 전(${shortConfigId(previous.id)})과 달라진 것: ${changes.slice(0, 6).map((change) => change.text).join(" / ")}${changes.length > 6 ? ` 외 ${changes.length - 6}개` : ""}`
          : "바로 전과 같아요";
        return (
          <button key={id} type="button" title={`${title} · 눌러서 이 설정 묶음만 보기`} onClick={() => onConfig(id)} className={cx(opsTheme.link, "ml-1.5 text-[11px]")}>
            새 설정 묶음 {shortConfigId(id)}
          </button>
        );
      })}
    </>
  );
}
