import {
  AGENT_PERIOD_DEFAULT_DAYS, AGENT_PERIOD_MAX_DAYS, AGENT_PERIOD_PRESETS, addDays, kstDay, periodDayLabel, resolveAgentPeriod,
  type AgentPeriodInput,
} from "@/lib/gtmPlays/agent/period";
import { Select, TextInput } from "../ui";

/**
 * One panel's period (수치, 로그 and 하루별 성능 each keep their own; Shaun 11/18): a quick pick (최근 7·30·90일, ending
 * today) or any 시작일 ~ 종료일 (KST days, both ends in).
 */
export type PeriodState = { choice: number | "custom"; from: string; to: string };

/** 최근 30일, as every panel starts. */
export function defaultPeriod(): PeriodState {
  const today = kstDay();
  return { choice: AGENT_PERIOD_DEFAULT_DAYS, from: addDays(today, -(AGENT_PERIOD_DEFAULT_DAYS - 1)), to: today };
}

/** One KST day as a period (a 하루별 성능 day). */
export const dayPeriod = (day: string): PeriodState => ({ choice: "custom", from: day, to: day });

/** What the API reads: a quick pick's days (it ends today whenever it is read) or the two dates. */
export function periodInput(state: PeriodState): AgentPeriodInput {
  return state.choice === "custom" ? { from: state.from, to: state.to } : { days: state.choice };
}

/** The days it covers in the screen's words: "11. 1. ~ 11. 18.", or "11. 18." for one day. */
export function periodRangeLabel(state: PeriodState): string {
  const today = kstDay();
  const { from, to } = resolveAgentPeriod(periodInput(state), today);
  const year = today.slice(0, 4);
  return from === to ? periodDayLabel(from, year) : `${periodDayLabel(from, year)} ~ ${periodDayLabel(to, year)}`;
}

/**
 * 기간: a quick pick, and the start and end dates always there to change (changing one makes it 직접 고르기). The end
 * is not before the start nor after today, and the range is at most 365 days.
 */
export function PeriodPicker({ value, onChange, label = "기간" }: {
  value: PeriodState; onChange: (value: PeriodState) => void; label?: string;
}) {
  const today = kstDay();
  const { from, to } = resolveAgentPeriod(periodInput(value), today);
  const earliest = addDays(to, -(AGENT_PERIOD_MAX_DAYS - 1));
  const pick = (choice: string) => {
    if (choice === "custom") { onChange({ choice: "custom", from, to }); return; }
    const days = Number(choice);
    onChange({ choice: days, from: addDays(today, -(days - 1)), to: today });
  };
  const setFrom = (next: string) => { if (next) onChange({ choice: "custom", from: next, to: next > to ? next : to }); };
  const setTo = (next: string) => { if (next) onChange({ choice: "custom", from: next < from ? next : from, to: next }); };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="w-32">
        <Select aria-label={label} value={String(value.choice)} onChange={(event) => pick(event.target.value)}>
          {AGENT_PERIOD_PRESETS.map((days) => <option key={days} value={days}>최근 {days}일</option>)}
          <option value="custom">직접 고르기</option>
        </Select>
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap text-[12px] text-neutral-muted">
        <span className="w-36"><TextInput type="date" aria-label={`${label} 시작일`} value={from} min={earliest} max={to} onChange={(event) => setFrom(event.target.value)} /></span>
        ~
        <span className="w-36"><TextInput type="date" aria-label={`${label} 종료일`} value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} /></span>
      </span>
    </span>
  );
}
