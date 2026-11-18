import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { FunnelColumn } from "@/lib/gtmPlays/agent/funnel";
import type { AgentConfig } from "@/lib/gtmPlays/agent/config";
import { filtersForColumn } from "@/lib/gtmPlays/agent/stage";
import type { AgentRun } from "@/lib/gtmPlays/agent/store.server";
import type { AgentSettings } from "@/lib/gtmPlays/agent/types";
import type { AgentFunnel, AgentHealth } from "@/lib/gtmPlays/agent/views.server";
import AgentApplicantUpload from "./agent/AgentApplicantUpload";
import { AgentConfigsContext } from "./agent/AgentConfig";
import AgentDailyTable from "./agent/AgentDailyTable";
import AgentFunnelTable from "./agent/AgentFunnelTable";
import AgentPeople, { NO_PEOPLE_FILTER, type PeopleFilter } from "./agent/AgentPeople";
import AgentSearchLog from "./agent/AgentSearchLog";
import AgentSettingsForm from "./agent/AgentSettingsForm";
import { usd } from "./agent/labels";
import { PeriodPicker, dayPeriod, defaultPeriod, periodInput, periodRangeLabel, type PeriodState } from "./agent/PeriodPicker";
import { formatKst, useGtmAction } from "./api";
import { Button, ErrorNotice, Panel, Switch } from "./ui";

type Overview = { settings: AgentSettings; funnel: AgentFunnel; runs: AgentRun[]; health: AgentHealth };

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
 * 후보자 소싱 에이전트: finds people who show they are looking (LinkedIn applicants Ops uploads, job-seeking posts and
 * profiles by site, the open web), proposes 2-3 fitting postings and emails them. The screen is what Ops needs to run
 * it (Shaun 11/17): the applicant file, the settings and the on/off switch with what is wrong, the numbers (합계 first,
 * then a row per source), the log and 하루별 성능. 수치, 로그 and 하루별 성능 each have their own period (Shaun 11/18), all
 * 최근 30일 at first; a number opens exactly its people in the log, which takes that number's period (or its day).
 * Every search, person and day can be traced to the 설정 묶음 it ran with (agent/config.ts).
 */
export default function AgentTab({ writes }: { writes: boolean }) {
  // Each panel's own period (최근 7·30·90일 or any 시작일 ~ 종료일, KST days, both ends in).
  const [numbersPeriod, setNumbersPeriod] = useState<PeriodState>(defaultPeriod);
  const [logPeriod, setLogPeriod] = useState<PeriodState>(defaultPeriod);
  const [dailyPeriod, setDailyPeriod] = useState<PeriodState>(defaultPeriod);
  const numbersInput = useMemo(() => periodInput(numbersPeriod), [numbersPeriod]);
  const logInput = useMemo(() => periodInput(logPeriod), [logPeriod]);
  const dailyInput = useMemo(() => periodInput(dailyPeriod), [dailyPeriod]);
  // Test rows never count on the screen (Shaun 11/17: no "테스트 포함" box).
  const includeTest = false;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 로그 and 하루별 성능 fold away like 설정, closed at first (Shaun 11/18); a number clicked above opens the log.
  const [logOpen, setLogOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [logTab, setLogTab] = useState<LogTab>("people");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>(NO_PEOPLE_FILTER);
  const [searchSource, setSearchSource] = useState<string | null>(null);
  const [searchDay, setSearchDay] = useState<string | null>(null);
  const [searchConfig, setSearchConfig] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const overview = useGtmAction<Overview>();
  const { run } = overview;
  const load = useCallback(() => { void run("agent.overview", { ...numbersInput, includeTest }); }, [run, numbersInput, includeTest]);
  useEffect(() => { load(); }, [load, refreshKey]);
  // Every 설정 묶음, for the log's and 하루별 성능's "설정 묶음 #… (…부터)" and the filter.
  const configList = useGtmAction<{ configs: AgentConfig[] }>();
  const loadConfigs = configList.run;
  useEffect(() => { void loadConfigs("agent.configs"); }, [loadConfigs, refreshKey]);
  const configs = configList.result?.configs ?? [];
  const refresh = () => setRefreshKey((key) => key + 1);
  const data = overview.result;
  const settings = data?.settings ?? null;
  const sources = data ? Object.keys(data.funnel.bySource) : [];
  const problems = data ? problemsOf(data) : [];
  const showLog = (tab: LogTab) => {
    setLogTab(tab);
    setLogOpen(true);
    requestAnimationFrame(() => logRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  // A 수치 number: its people over 수치's period.
  const pickNumber = (source: string | null, column: FunnelColumn) => {
    setLogPeriod(numbersPeriod);
    setPeopleFilter({ ...NO_PEOPLE_FILTER, source, ...filtersForColumn(column) });
    showLog("people");
  };
  // 하루별 성능: its own 찾은 곳 and 설정 묶음 (전체 by default); a number opens its people (that day, or the panel's
  // period on the 합계 row), a 비용 that day's searches.
  const [dailySource, setDailySource] = useState<string | null>(null);
  const [dailyConfig, setDailyConfig] = useState<string | null>(null);
  const pickDaily = (day: string | null, column: FunnelColumn) => {
    if (!day) setLogPeriod(dailyPeriod);
    setPeopleFilter({ ...NO_PEOPLE_FILTER, source: dailySource, day, config: dailyConfig, ...filtersForColumn(column) });
    showLog("people");
  };
  const costDaily = (day: string | null) => {
    if (!day) setLogPeriod(dailyPeriod);
    setSearchSource(dailySource);
    setSearchDay(day);
    setSearchConfig(dailyConfig);
    showLog("searches");
  };
  // The log's range as used now: a day chip (a 하루별 성능 day) narrows it to that day.
  const logDay = logTab === "people" ? peopleFilter.day : searchDay;
  const shownLogPeriod = logDay ? dayPeriod(logDay) : logPeriod;
  const changeLogPeriod = (next: PeriodState) => {
    setLogPeriod(next);
    setPeopleFilter((filter) => ({ ...filter, day: null }));
    setSearchDay(null);
  };
  // On: the agent runs on its schedule (the dispatcher picks it up within minutes). Off: stops every run now. Only
  // the switch changes the on/off (the settings form never sends it).
  const toggle = useGtmAction<{ settings: AgentSettings }>();
  const setEnabled = async (on: boolean) => {
    if (!settings) return;
    if (await toggle.run(on ? "agent.enable" : "agent.stop")) refresh();
  };
  return (
    <AgentConfigsContext.Provider value={configs}>
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
          title={`수치 · ${periodRangeLabel(numbersPeriod)}`}
          actions={(
            <span className="flex flex-wrap items-center gap-2">
              <PeriodPicker label="수치 기간" value={numbersPeriod} onChange={setNumbersPeriod} />
              <Button className="whitespace-nowrap" loading={overview.loading} onClick={refresh}>새로고침</Button>
            </span>
          )}
        >
          <ErrorNotice message={overview.error} />
          {data ? (
            <AgentFunnelTable
              funnel={data.funnel}
              onPick={pickNumber}
              onCost={(source) => {
                setLogPeriod(numbersPeriod);
                setSearchSource(source);
                setSearchDay(null);
                setSearchConfig(null);
                showLog("searches");
              }}
            />
          ) : overview.loading ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
        </Panel>

        <div ref={logRef} className="scroll-mt-4">
          <Panel
            title={`로그 · ${periodRangeLabel(shownLogPeriod)}`}
            open={logOpen}
            onToggle={setLogOpen}
            actions={(
              <span className="flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-md border border-neutral-1000-a05 text-[12px]">
                  {LOG_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => { setLogTab(tab.id); setLogOpen(true); }}
                      className={cx("px-3 py-1", logTab === tab.id ? "bg-bg-weak font-medium text-neutral-primary" : "text-neutral-muted hover:bg-bg-weak/70")}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <PeriodPicker label="로그 기간" value={shownLogPeriod} onChange={changeLogPeriod} />
              </span>
            )}
          >
            {logTab === "people" ? (
              <AgentPeople period={logInput} includeTest={includeTest} refreshKey={refreshKey} sources={sources} filter={peopleFilter} onFilter={setPeopleFilter} />
            ) : (
              <AgentSearchLog
                period={logInput}
                includeTest={includeTest}
                refreshKey={refreshKey}
                sources={sources}
                source={searchSource}
                onSource={setSearchSource}
                day={searchDay}
                onDay={setSearchDay}
                config={searchConfig}
                onConfig={setSearchConfig}
                onShowPeople={(found) => { setPeopleFilter({ ...NO_PEOPLE_FILTER, run: found }); showLog("people"); }}
              />
            )}
          </Panel>
        </div>

        <Panel
          title={`하루별 성능 · ${periodRangeLabel(dailyPeriod)}`}
          open={dailyOpen}
          onToggle={setDailyOpen}
          actions={<PeriodPicker label="하루별 성능 기간" value={dailyPeriod} onChange={setDailyPeriod} />}
        >
          <AgentDailyTable
            period={dailyInput}
            includeTest={includeTest}
            refreshKey={refreshKey}
            sources={sources}
            source={dailySource}
            onSource={setDailySource}
            config={dailyConfig}
            onConfig={setDailyConfig}
            onPick={pickDaily}
            onCost={costDaily}
          />
        </Panel>
      </div>
    </AgentConfigsContext.Provider>
  );
}
