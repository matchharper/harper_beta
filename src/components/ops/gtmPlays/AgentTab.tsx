import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { FunnelColumn } from "@/lib/gtmPlays/agent/funnel";
import { AGENT_PERIOD_DEFAULT_DAYS, AGENT_PERIOD_MAX_DAYS, AGENT_PERIOD_PRESETS, addDays, kstDay, resolveAgentPeriod, type AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import { filtersForColumn } from "@/lib/gtmPlays/agent/stage";
import type { AgentRun } from "@/lib/gtmPlays/agent/store.server";
import type { AgentSettings } from "@/lib/gtmPlays/agent/types";
import type { AgentFunnel, AgentHealth } from "@/lib/gtmPlays/agent/views.server";
import AgentApplicantUpload from "./agent/AgentApplicantUpload";
import AgentFunnelTable from "./agent/AgentFunnelTable";
import AgentPeople, { NO_PEOPLE_FILTER, type PeopleFilter } from "./agent/AgentPeople";
import AgentSearchLog from "./agent/AgentSearchLog";
import AgentSettingsForm from "./agent/AgentSettingsForm";
import { usd } from "./agent/labels";
import { formatKst, useGtmAction } from "./api";
import { Button, ErrorNotice, Panel, Select, Switch, TextInput } from "./ui";

type Overview = { settings: AgentSettings; funnel: AgentFunnel; runs: AgentRun[]; health: AgentHealth };

/** The period picker's value: a preset's days, or "custom" (직접 고르기: two KST dates). */
type PeriodChoice = number | "custom";
const DAY_MS = 86_400_000;
const UPLOAD_STALE_DAYS = 3;

/** "11. 14." in Korea time. */
const kstDate = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).format(new Date(value));

/**
 * What is wrong right now, in plain words (Shaun 11/17: a red line only when something is wrong, nothing otherwise):
 * no sender, today's money cap reached, the last run's error, a team mailbox whose replies are not being read (with
 * the mailbox and why; follow-ups wait meanwhile), no applicant file for 3+ days.
 */
function problemsOf(data: Overview, now = Date.now()): string[] {
  const { settings, funnel, health } = data;
  const problems: string[] = [];
  if (!settings.senderEmail?.trim()) problems.push("보내는 주소가 없어요");
  else if (!settings.senderName?.trim()) problems.push("보내는 사람 이름이 없어요");
  if (funnel.today.costUsd >= funnel.today.costCapUsd) problems.push(`오늘 비용 한도(${usd(funnel.today.costCapUsd)})에 닿아 오늘은 멈췄어요`);
  if (health.lastRunError) problems.push(`마지막 실행에서 오류: ${health.lastRunError}`);
  for (const trouble of health.replyReading ?? []) {
    problems.push(`답장 확인 안 됨: ${trouble.mailbox ? `${trouble.mailbox} · ` : ""}${trouble.problem}${trouble.lastReadAt ? ` · 마지막으로 읽은 때 ${formatKst(trouble.lastReadAt)}` : ""}`);
  }
  if (health.replyReading?.length) problems.push("답장을 다시 읽을 수 있을 때까지 후속 메일은 보내지 않고 기다려요");
  if (!health.lastUpload) problems.push("지원자 파일을 아직 올리지 않았어요");
  else {
    const days = Math.floor((now - Date.parse(health.lastUpload.at)) / DAY_MS);
    if (days >= UPLOAD_STALE_DAYS) problems.push(`지원자 파일을 ${days}일 동안 안 올렸어요 (마지막 ${kstDate(health.lastUpload.at)})`);
  }
  return problems;
}

type LogTab = "people" | "searches";
const LOG_TABS: Array<{ id: LogTab; label: string }> = [{ id: "people", label: "사람" }, { id: "searches", label: "검색" }];

/** Domains the open-web search kept people on in the latest runs (counts new_domain:<domain>), most first. */
function newDomainsOf(runs: readonly AgentRun[]) {
  const kept = new Map<string, number>();
  for (const run of runs) {
    for (const [key, count] of Object.entries(run.counts)) {
      if (key.startsWith("new_domain:")) kept.set(key.slice("new_domain:".length), (kept.get(key.slice("new_domain:".length)) ?? 0) + count);
    }
  }
  return [...kept.entries()].map(([domain, count]) => ({ domain, kept: count })).sort((a, b) => b.kept - a.kept);
}

/**
 * 기간: 최근 7·30·90일, or 직접 고르기 with two KST dates (시작일 ~ 종료일, both in; the end not before the start, not
 * after today, at most 365 days). The numbers and both logs follow it.
 */
function PeriodPicker({ choice, range, onChoice, onRange }: {
  choice: PeriodChoice; range: { from: string; to: string };
  onChoice: (choice: PeriodChoice) => void; onRange: (range: { from: string; to: string }) => void;
}) {
  const today = kstDay();
  const earliest = addDays(range.to, -(AGENT_PERIOD_MAX_DAYS - 1));
  const setFrom = (from: string) => { if (from) onRange({ from, to: from > range.to ? from : range.to }); };
  const setTo = (to: string) => { if (to) onRange({ from: to < range.from ? to : range.from, to }); };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="w-32">
        <Select
          aria-label="기간"
          value={String(choice)}
          onChange={(event) => onChoice(event.target.value === "custom" ? "custom" : Number(event.target.value))}
        >
          {AGENT_PERIOD_PRESETS.map((value) => <option key={value} value={value}>최근 {value}일</option>)}
          <option value="custom">직접 고르기</option>
        </Select>
      </span>
      {choice === "custom" ? (
        <span className="flex items-center gap-1 whitespace-nowrap text-[12px] text-neutral-muted">
          <span className="w-36"><TextInput type="date" aria-label="시작일" value={range.from} min={earliest} max={range.to} onChange={(event) => setFrom(event.target.value)} /></span>
          ~
          <span className="w-36"><TextInput type="date" aria-label="종료일" value={range.to} min={range.from} max={today} onChange={(event) => setTo(event.target.value)} /></span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * 후보자 소싱 에이전트: finds people who show they are looking (LinkedIn applicants Ops uploads, job-seeking posts and
 * profiles by site, the open web), proposes 2-3 fitting postings and emails them. The screen is what Ops needs to run
 * it (Shaun 11/17): the applicant file, the settings and the on/off switch with what is wrong, the numbers (합계 first,
 * then a row per source) and the log of the same period. A number opens exactly its people in the log.
 */
export default function AgentTab({ writes }: { writes: boolean }) {
  // One period for the numbers and both logs (Shaun 11/17: 최근 7·30·90일 or 직접 고르기, KST days, both ends in).
  const [choice, setChoice] = useState<PeriodChoice>(AGENT_PERIOD_DEFAULT_DAYS);
  const [range, setRange] = useState(() => {
    const today = kstDay();
    return { from: addDays(today, -(AGENT_PERIOD_DEFAULT_DAYS - 1)), to: today };
  });
  const period: AgentPeriodInput = useMemo(
    () => (choice === "custom" ? { from: range.from, to: range.to } : { days: choice }),
    [choice, range.from, range.to],
  );
  // Test rows never count on the screen (Shaun 11/17: no "테스트 포함" box).
  const includeTest = false;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logTab, setLogTab] = useState<LogTab>("people");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>(NO_PEOPLE_FILTER);
  const [searchSource, setSearchSource] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const overview = useGtmAction<Overview>();
  const { run } = overview;
  const load = useCallback(() => { void run("agent.overview", { ...period, includeTest }); }, [run, period, includeTest]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const refresh = () => setRefreshKey((key) => key + 1);
  const data = overview.result;
  const settings = data?.settings ?? null;
  const sources = data ? Object.keys(data.funnel.bySource) : [];
  const problems = data ? problemsOf(data) : [];
  const showLog = (tab: LogTab) => {
    setLogTab(tab);
    requestAnimationFrame(() => logRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const pickNumber = (source: string | null, column: FunnelColumn) => {
    setPeopleFilter({ ...NO_PEOPLE_FILTER, source, ...filtersForColumn(column) });
    showLog("people");
  };
  // On: the agent runs on its schedule (the dispatcher picks it up within minutes). Off: stops every run now. Only
  // the switch changes the on/off (the settings form never sends it).
  const toggle = useGtmAction<{ settings: AgentSettings }>();
  const setEnabled = async (on: boolean) => {
    if (!settings) return;
    if (await toggle.run(on ? "agent.enable" : "agent.stop")) refresh();
  };
  return (
    <div className="space-y-5">
      <AgentApplicantUpload writes={writes} onImported={refresh} lastUpload={data?.health.lastUpload ?? null} />

      <section className={cx(opsTheme.panel, "space-y-3 p-5 shadow-sm")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-expanded={settingsOpen}
            className="flex items-center gap-1 text-[15px] font-semibold tracking-[-0.02em]"
          >
            설정 {settingsOpen ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          </button>
          <div className="flex items-center gap-3">
            {settings ? (
              <Switch
                checked={settings.enabled}
                busy={toggle.loading}
                disabled={!writes && !settings.enabled}
                label={settings.enabled ? "켜짐" : "꺼짐"}
                onChange={(on) => void setEnabled(on)}
              />
            ) : null}
          </div>
        </div>
        {problems.length ? (
          <ul className="space-y-0.5 text-[13px] text-critical">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        ) : null}
        <ErrorNotice message={toggle.error} />
        {settingsOpen ? (
          <div className="border-t border-neutral-1000-a05 pt-4">
            {settings ? (
              <AgentSettingsForm
                // A new saved version starts the form again; the switch alone does not (it keeps what is being typed).
                key={settings.version}
                settings={settings}
                writes={writes}
                newDomains={newDomainsOf(data?.runs ?? [])}
                onSaved={(next) => { overview.setResult(data ? { ...data, settings: next } : data); refresh(); }}
              />
            ) : <p className="text-[12px] text-neutral-muted">불러오는 중…</p>}
          </div>
        ) : null}
      </section>

      <Panel
        title="수치"
        actions={(
          <span className="flex items-center gap-2">
            <PeriodPicker choice={choice} range={range} onChoice={setChoice} onRange={setRange} />
            <Button className="whitespace-nowrap" loading={overview.loading} onClick={refresh}>새로고침</Button>
          </span>
        )}
      >
        <ErrorNotice message={overview.error} />
        {data ? (
          <AgentFunnelTable
            funnel={data.funnel}
            onPick={pickNumber}
            onCost={(source) => { setSearchSource(source); showLog("searches"); }}
          />
        ) : overview.loading ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
      </Panel>

      <div ref={logRef} className="scroll-mt-4">
        <Panel
          title={`로그 · ${data?.funnel.period.label ?? resolveAgentPeriod(period, kstDay()).label}`}
          actions={(
            <div className="inline-flex overflow-hidden rounded-md border border-neutral-1000-a05 text-[12px]">
              {LOG_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLogTab(tab.id)}
                  className={cx("px-3 py-1", logTab === tab.id ? "bg-bg-weak font-medium text-neutral-primary" : "text-neutral-muted hover:bg-bg-weak/70")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        >
          {logTab === "people" ? (
            <AgentPeople period={period} includeTest={includeTest} refreshKey={refreshKey} sources={sources} filter={peopleFilter} onFilter={setPeopleFilter} />
          ) : (
            <AgentSearchLog
              period={period}
              includeTest={includeTest}
              refreshKey={refreshKey}
              sources={sources}
              source={searchSource}
              onSource={setSearchSource}
              onShowPeople={(found) => { setPeopleFilter({ ...NO_PEOPLE_FILTER, run: found }); showLog("people"); }}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
