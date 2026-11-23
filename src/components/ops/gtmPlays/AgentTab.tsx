import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { FunnelColumn } from "@/lib/gtmPlays/agent/funnel";
import { AGENT_PERIOD_PRESETS, addDays, kstDay } from "@/lib/gtmPlays/agent/period";
import type { AgentConfig } from "@/lib/gtmPlays/agent/config";
import { filtersForColumn } from "@/lib/gtmPlays/agent/stage";
import type { AgentRun } from "@/lib/gtmPlays/agent/store.server";
import type { AgentSettings } from "@/lib/gtmPlays/agent/types";
import type { AgentConversationHealth } from "@/lib/gtmPlays/agent/conversationViews.server";
import type { AgentFunnel, AgentHealth } from "@/lib/gtmPlays/agent/views.server";
import type { NumbersPick, NumbersRows } from "@/lib/gtmPlays/agent/numbers";
import AgentApplicantUpload from "./agent/AgentApplicantUpload";
import AgentCandidateNumbers, { NumbersRowsControl } from "./agent/AgentCandidateNumbers";
import AgentCompanyNumbers from "./agent/AgentCompanyNumbers";
import { AgentConfigsContext } from "./agent/AgentConfig";
import AgentPeople, { NO_PEOPLE_FILTER, type PeopleFilter } from "./agent/AgentPeople";
import AgentSearchLog from "./agent/AgentSearchLog";
import AgentSettingsForm from "./agent/AgentSettingsForm";
import { usd } from "./agent/labels";
import { PeriodPicker, dayPeriod, defaultPeriod, periodInput, periodRangeLabel, type PeriodState } from "./agent/PeriodPicker";
import { formatKst, useGtmAction } from "./api";
import { Button, ErrorNotice, Panel, Switch } from "./ui";

type Overview = { settings: AgentSettings; funnel: AgentFunnel; runs: AgentRun[]; health: AgentHealth; conversation?: AgentConversationHealth };

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

// 로그: 사람 (one line per person; the right pane is everything that happened with them, in one time order) and 검색.
// The 메일 tab is gone (Shaun 11/22): every mail is in its person's history, and 사람이 볼 답장 is a 상태 of 사람.
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
 * gtm agent: finds people who show they are looking (LinkedIn applicants Ops uploads, job-seeking posts and
 * profiles by site, the open web), proposes 2-3 fitting postings and emails them. The screen tracks everything it does
 * (Shaun 11/17, revamped 11/22): the applicant file; the settings and the on/off switch with what is wrong; 수치 · 후보
 * (지금까지 on top, then 합계 + a row per site, day or search query, step by step: 찾기 · 공고 · 메일 · 답장; it replaces
 * 수치 and 하루별 성능); 수치 · 회사 (outside companies and Harper customers the candidates led to); the log (사람 · 검색).
 * Each panel has its own period, 최근 30일 at first; a number opens exactly its people in the log, which takes that
 * number's period (or its day). Every search, person and day can be traced to the 설정 묶음 it ran with (agent/config.ts).
 */
export default function AgentTab({ writes }: { writes: boolean }) {
  // Each panel's own period (최근 7·30·90일 or any 시작일 ~ 종료일, KST days, both ends in).
  const [numbersPeriod, setNumbersPeriod] = useState<PeriodState>(defaultPeriod);
  const [companyPeriod, setCompanyPeriod] = useState<PeriodState>(defaultPeriod);
  const [logPeriod, setLogPeriod] = useState<PeriodState>(defaultPeriod);
  const numbersInput = useMemo(() => periodInput(numbersPeriod), [numbersPeriod]);
  const companyInput = useMemo(() => periodInput(companyPeriod), [companyPeriod]);
  const logInput = useMemo(() => periodInput(logPeriod), [logPeriod]);
  // 수치 · 후보's rows: 사이트별 at first (the old 수치), 날짜별 from the Slack daily table's link.
  const [numbersRows, setNumbersRows] = useState<NumbersRows>("source");
  // Test rows never count on the screen (Shaun 11/17: no "테스트 포함" box).
  const includeTest = false;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 로그 folds away like 설정, closed at first (Shaun 11/18); a number clicked above opens it.
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<LogTab>("people");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>(NO_PEOPLE_FILTER);
  // The person a Slack reply alert's link opens (agent/replies.ts agentPersonLink), on the right of 로그 · 사람.
  const [linkedPerson, setLinkedPerson] = useState<string | null>(null);
  // Slack links: the daily table's ?open=daily&from=&to= opens 수치 · 후보 by day on those days (agent/dailyReport.ts); a reply
  // alert's ?open=person&person=<id>&q=<address> opens that person in 로그 · 사람 over the longest quick period.
  const router = useRouter();
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (!router.isReady || openedFromLink.current) return;
    if (router.query.open === "person") {
      const person = typeof router.query.person === "string" && /^[0-9a-f-]{36}$/i.test(router.query.person) ? router.query.person : null;
      if (!person) return;
      openedFromLink.current = true;
      const q = typeof router.query.q === "string" ? router.query.q.trim().slice(0, 200) : "";
      const days = AGENT_PERIOD_PRESETS[AGENT_PERIOD_PRESETS.length - 1];
      const today = kstDay();
      setLogPeriod({ choice: days, from: addDays(today, -(days - 1)), to: today });
      setPeopleFilter({ ...NO_PEOPLE_FILTER, q });
      setLinkedPerson(person);
      setLogTab("people");
      setLogOpen(true);
      window.setTimeout(() => logRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
      return;
    }
    if (router.query.open !== "daily") return;
    openedFromLink.current = true;
    const day = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
    const from = day(router.query.from);
    const to = day(router.query.to);
    if (from && to) setNumbersPeriod({ choice: "custom", from: from <= to ? from : to, to: from <= to ? to : from });
    setNumbersRows("day");
    window.setTimeout(() => document.getElementById("agent-numbers")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [router.isReady, router.query.open, router.query.from, router.query.to, router.query.person, router.query.q]);
  const [searchSource, setSearchSource] = useState<string | null>(null);
  const [searchDay, setSearchDay] = useState<string | null>(null);
  const [searchConfig, setSearchConfig] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const overview = useGtmAction<Overview>();
  const { run } = overview;
  const load = useCallback(() => { void run("agent.overview", { ...numbersInput, includeTest }); }, [run, numbersInput, includeTest]);
  useEffect(() => { load(); }, [load, refreshKey]);
  // Every 설정 묶음, for the log's and 수치 · 후보's "설정 묶음 #… (…부터)" and the filter.
  const configList = useGtmAction<{ configs: AgentConfig[] }>();
  const loadConfigs = configList.run;
  useEffect(() => { void loadConfigs("agent.configs"); }, [loadConfigs, refreshKey]);
  const configs = configList.result?.configs ?? [];
  const refresh = () => setRefreshKey((key) => key + 1);
  const data = overview.result;
  const settings = data?.settings ?? null;
  const sources = data ? Object.keys(data.funnel.bySource) : [];
  const problems = data ? problemsOf(data) : [];
  // 사람이 볼 답장: the people with a reply handed to a person that no one answered yet (a red line only then); a click
  // lists exactly them (conversationViews.server.ts counts the list's people, not their mails).
  const awaitingHuman = data?.conversation?.awaitingHuman ?? 0;
  const showLog = (tab: LogTab) => {
    setLogTab(tab);
    setLogOpen(true);
    requestAnimationFrame(() => logRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  // A 수치 · 후보 number: its people (its row's site, day, search query and 설정 묶음, and its column's 상태) over the
  // panel's period, a day row's over that day (the log's day chip), 지금까지's 가입 over every day since the start.
  const pickNumber = (pick: NumbersPick, column: FunnelColumn, period?: { from: string; to: string }) => {
    setLogPeriod(period ? { choice: "custom", from: period.from, to: period.to } : numbersPeriod);
    setPeopleFilter({ ...NO_PEOPLE_FILTER, source: pick.source, day: pick.day, query: pick.query, config: pick.config, ...filtersForColumn(column) });
    showLog("people");
  };
  // What a row's searches did or cost: its searches in 로그 · 검색.
  const pickSearches = (pick: { source: string | null; day: string | null; config: string | null }) => {
    setLogPeriod(numbersPeriod);
    setSearchSource(pick.source);
    setSearchDay(pick.day);
    setSearchConfig(pick.config);
    showLog("searches");
  };
  // A 수치 · 회사 number: exactly the candidates behind it, whenever they were found (a chip with the number's words).
  const pickCompany = (ids: string[], label: string) => {
    setPeopleFilter({ ...NO_PEOPLE_FILTER, ids: { ids, label } });
    showLog("people");
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
          {problems.length || awaitingHuman ? (
            <ul className="space-y-0.5 text-[13px] text-critical">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
              {awaitingHuman ? (
                <li>
                  <button type="button" className="hover:underline" onClick={() => { setPeopleFilter({ ...NO_PEOPLE_FILTER, awaitingHuman: true }); showLog("people"); }}>
                    사람이 볼 답장 {awaitingHuman}명
                  </button>
                </li>
              ) : null}
            </ul>
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
          id="agent-numbers"
          title={`수치 · 후보 · ${periodRangeLabel(numbersPeriod)}`}
          actions={(
            <span className="flex flex-wrap items-center gap-2">
              <NumbersRowsControl value={numbersRows} onChange={setNumbersRows} />
              <PeriodPicker label="수치 · 후보 기간" value={numbersPeriod} onChange={setNumbersPeriod} />
              <Button className="whitespace-nowrap" loading={overview.loading} onClick={refresh}>새로고침</Button>
            </span>
          )}
        >
          <ErrorNotice message={overview.error} />
          <AgentCandidateNumbers
            period={numbersInput}
            refreshKey={refreshKey}
            sources={sources}
            funnel={data?.funnel ?? null}
            sendWeekdays={settings?.sendWeekdays ?? null}
            rows={numbersRows}
            onRows={setNumbersRows}
            onPick={pickNumber}
            onSearches={pickSearches}
          />
        </Panel>

        <Panel
          title={`수치 · 회사 · ${periodRangeLabel(companyPeriod)}`}
          actions={<PeriodPicker label="수치 · 회사 기간" value={companyPeriod} onChange={setCompanyPeriod} />}
        >
          <AgentCompanyNumbers period={companyInput} refreshKey={refreshKey} onPick={pickCompany} />
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
              <AgentPeople period={logInput} includeTest={includeTest} refreshKey={refreshKey} sources={sources} filter={peopleFilter} onFilter={setPeopleFilter} openPerson={linkedPerson} />
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

      </div>
    </AgentConfigsContext.Provider>
  );
}
