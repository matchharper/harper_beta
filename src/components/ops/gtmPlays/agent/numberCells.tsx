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
  source: "그 사람을 찾은 곳이에요. 링크드인에는 올린 지원자 파일도 들어가요.",
  found: "고른 기간에 에이전트가 찾은 사람이에요. 같은 사람은 한 번만 세요.",
  excluded: "연락하지 않기로 한 사람이에요(이미 회원, 최근 연락함, 이메일 없음 등). 이유별 수는 마우스를 올리면 보여요.",
  contacted: "메일이 나간 사람이에요. %는 연락 ÷ 찾음이에요.",
  clicked: "메일 링크로 하퍼 페이지를 1초 넘게 본 사람이에요(가입 포함). %는 클릭 ÷ 연락이에요.",
  signedUp: "메일 링크로 하퍼 계정을 만든 사람이에요(온보딩 전 포함). 괄호 안은 가입 ÷ 연락이에요.",
  interested: "메일로 받은 공고를 저장하거나 지원한 사람이에요(회사 연결까지 간 사람 포함).",
  connected: "메일로 받은 공고의 회사와 하퍼에서 연결된 사람이에요. 가장 중요한 숫자예요.",
  replied: "답장한 사람이에요(자동응답·반송은 빼요). 괄호 안은 답장 ÷ 연락이에요.",
  ashleyReplied: "Ashley 답장이 한 통 이상 나간 사람이에요.",
  noReply: "Ashley가 답하지 않기로 한 사람이에요(그만 보내 달라거나 분명히 거절한 사람 포함). 이유는 마우스를 올리면 보여요.",
  handedOff: "Ashley 대신 운영팀이 봐야 할 메일이 있는 사람이에요(봇인지 묻기, 가격·법률 문의, 보내지 못한 답장 등).",
  signedUpAfterReply: "답장한 뒤 가입한 사람이에요.",
  delivery: "연락한 사람 중 반송 / 스팸 신고 / 수신 거부 수예요(수신 거부는 링크 클릭 + 그만 보내 달라는 답장). Gmail 신고는 여기 안 잡혀서, 아래에 도메인 전체 Gmail 스팸 비율을 보여 줘요(Google 권장 0.1% 미만, 최대 0.3%).",
} as const;

/** The columns of the 날짜 rows and of 검색 수율 and 추천 품질 (ⓘ); the rest are FUNNEL_HINTS. */
export const DAY_HINTS = {
  day: "사람을 찾은 날(한국 시간)이에요. 그 뒤 클릭·가입·답장도 찾은 날에 세서, 최근 날짜는 더 늘 수 있어요.",
  run: "그날 검색한 곳 수와 올린 지원자 파일 수예요. 비용 한도에 닿아 건너뛴 곳도 적어요.",
  lookup: "이메일 찾기(유료)에 성공 / 시도한 사람 수예요. %는 성공 ÷ 시도예요.",
  perContact: "비용 ÷ 연락이에요. 한 명에게 메일을 보내기까지 든 비용이에요.",
  searches: "검색어를 돌린 횟수예요(검색어 하나를 한 번 돌리면 1번).",
  known: "검색에서 구직 중으로 본 사람 중, 전에 이미 찾아서 다시 넣지 않은 사람 수예요.",
  withAddress: "찾은 사람 중 보낼 이메일이 있는 사람이에요(이메일 찾기로 찾은 주소 포함). 괄호 안은 연락 가능 ÷ 찾음이에요.",
  perWithAddress: "검색 비용 ÷ 검색으로 새로 찾은 연락 가능 사람이에요. 지원자 파일로 올린 사람은 빼요.",
  // kept · fresh · contactable · perContactable: 하루별 성능 (AgentDailyTable) only, until 수치 · 후보 replaces it.
  searchCost: "검색과 검색 결과 판단에 쓴 비용이에요. 이메일 찾기 비용은 빼요.",
  sentPostings: "보낸 메일에 담긴 공고 수예요(한 통에 2~3개).",
  score: "보낸 공고를 고를 때 매긴 적합 점수(0~100)의 평균이에요. 높을수록 잘 맞아요.",
  graded: "메일에 넣기 전 더 엄격한 기준으로 다시 채점한 결과예요. 잘 맞음인 공고만 메일에 담겨요(%는 잘 맞음 ÷ 채점한 공고).",
  verdict: "운영팀이 공고마다 누른 맞음 / 안 맞음 수예요. '채점과 일치'는 운영팀 판단이 따로 채점과 같은 비율이에요(애매는 빼요).",
  config: "에이전트 설정 전체에 붙인 번호예요(하나라도 바뀌면 새 번호). 고르면 그 설정으로 찾은 사람과 한 검색만 세요.",
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

export const TODAY_COST_HINT = "오늘(한국 시간) 하루 한도에 세는 비용이에요(Ashley 답장 비용은 빼요). 한도에 닿으면 그날은 찾기·보내기를 멈춰요.";

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
