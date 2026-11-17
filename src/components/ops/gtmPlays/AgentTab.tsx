import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { AgentRun } from "@/lib/gtmPlays/agent/store.server";
import type { AgentSettings } from "@/lib/gtmPlays/agent/types";
import type { AgentFunnel } from "@/lib/gtmPlays/agent/views.server";
import AgentApplicantUpload from "./agent/AgentApplicantUpload";
import AgentFunnelTable from "./agent/AgentFunnelTable";
import AgentLog from "./agent/AgentLog";
import AgentPeople from "./agent/AgentPeople";
import AgentSettingsForm, { agentSenderWarning } from "./agent/AgentSettingsForm";
import { sourceLabel, usd, weekdaysLabel } from "./agent/labels";
import { formatKst, useGtmAction } from "./api";
import { Badge, Button, ErrorNotice, Panel, Select, Switch } from "./ui";

type Overview = { settings: AgentSettings; funnel: AgentFunnel; runs: AgentRun[] };

const PERIODS = [7, 30, 90] as const;
const RUN_KIND: Record<AgentRun["kind"], string> = { daily: "매일 실행", import: "지원자 파일", manual: "지금 실행" };
const RUN_STATUS: Record<AgentRun["status"], string> = {
  queued: "대기", running: "실행 중", done: "끝남", failed: "실패", stopped: "중지",
};
const COUNT_LABEL: Record<string, string> = {
  found: "찾음", excluded: "제외", no_fit: "맞는 회사 없음", matched: "공고 고름", drafted: "메일 씀", sent: "보냄",
  failed: "실패", stopped_cost_cap: "비용 상한에서 멈춤", errors: "오류",
  lookup_started: "이메일 찾기 시작", lookup_found: "이메일 찾음", lookup_not_found: "이메일 못 찾음",
};

/** A run's counts in words: per-source search lines are summed up as "검색 N곳 · 찾음 N명". */
function runCounts(counts: Record<string, number>) {
  const searched = Object.keys(counts).filter((key) => key.startsWith("searched_"));
  const foundBySearch = Object.entries(counts).filter(([key]) => key.startsWith("signal_found_")).reduce((sum, [, n]) => sum + n, 0);
  const parts = searched.length ? [`검색 ${searched.map((key) => sourceLabel(key.slice("searched_".length))).join("·")} · 새 사람 ${foundBySearch}명`] : [];
  for (const [key, count] of Object.entries(counts)) {
    if (count && COUNT_LABEL[key]) parts.push(`${COUNT_LABEL[key]} ${count}`);
  }
  return parts.join(" · ") || "—";
}

/** The latest runs: when, what, how far, what it cost, and why one stopped. */
function RunList({ runs }: { runs: AgentRun[] }) {
  if (!runs.length) return <p className="text-[12px] text-neutral-muted">아직 실행 기록이 없어요.</p>;
  return (
    <table className="w-full text-[12px]">
      <tbody className="divide-y divide-neutral-1000-a05">
        {runs.map((run) => (
          <tr key={run.id} className="align-top">
            <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-neutral-muted">{formatKst(run.createdAt)}</td>
            <td className="whitespace-nowrap py-1.5 pr-3">{RUN_KIND[run.kind]}{run.isTest ? " · 테스트" : ""}</td>
            <td className="whitespace-nowrap py-1.5 pr-3">
              <Badge tone={run.status === "failed" ? "critical" : run.status === "done" ? "positive" : "default"}>{RUN_STATUS[run.status]}</Badge>
            </td>
            <td className="py-1.5 pr-3 text-neutral-muted">
              {runCounts(run.counts)}
              {run.error ? <span className="ml-2 text-critical">{run.error}</span> : null}
            </td>
            <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-neutral-muted">{usd(run.costUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 로그 tabs, as Ops reads the agent's work: who it wrote to and what came of it; everyone it found (and why it did not
 * write to some); what each run searched and spent. There is no approval step: quality is checked here.
 */
type LogTab = "sent" | "people" | "runs";
const LOG_TABS: Array<{ id: LogTab; label: string }> = [
  { id: "sent", label: "보낸 메일" }, { id: "people", label: "찾은 사람" }, { id: "runs", label: "실행 기록" },
];

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
 * GTM 플레이 #5 후보자 소싱 에이전트: finds people who show they are looking (LinkedIn applicants Ops uploads, job-seeking
 * posts and profiles by domain, the open web), proposes 2-3 fitting postings and emails them. The screen is what Ops
 * needs to run it (Shaun 11/17): the settings and the on/off switch on top, then the numbers (합계 first, then a row per
 * source) and the log (with where each person was found).
 */
export default function AgentTab({ writes }: { writes: boolean }) {
  const [days, setDays] = useState<number>(30);
  // Test rows never count on the screen (Shaun 11/17: no "테스트 포함" box).
  const includeTest = false;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logTab, setLogTab] = useState<LogTab>("sent");
  const [refreshKey, setRefreshKey] = useState(0);
  const overview = useGtmAction<Overview>();
  const { run } = overview;
  const load = useCallback(() => { void run("agent.overview", { days, includeTest }); }, [run, days, includeTest]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const refresh = () => setRefreshKey((key) => key + 1);
  const data = overview.result;
  const settings = data?.settings ?? null;
  const senderWarning = settings ? agentSenderWarning(settings.senderName, settings.senderEmail) : null;
  // On: the agent runs on its schedule (the dispatcher picks it up within minutes). Off: 즉시 중지 (stops every run).
  const toggle = useGtmAction<{ settings: AgentSettings }>();
  const setEnabled = async (on: boolean) => {
    if (!settings) return;
    if (!on) {
      if (await toggle.run("agent.stop")) refresh();
      return;
    }
    const { updatedAt: _updatedAt, version: _version, ...rest } = settings;
    if (await toggle.run("agent.settings.save", { ...rest, enabled: true } as unknown as Record<string, unknown>)) refresh();
  };
  return (
    <div className="space-y-5">
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
        {senderWarning ? <p className={opsTheme.errorNotice}>{senderWarning}</p> : null}
        <ErrorNotice message={toggle.error} />
        {settingsOpen ? (
          <div className="border-t border-neutral-1000-a05 pt-4">
            {settings ? (
              <AgentSettingsForm
                key={settings.updatedAt ?? "defaults"}
                settings={settings}
                writes={writes}
                newDomains={newDomainsOf(data?.runs ?? [])}
                onSaved={(next) => { overview.setResult(data ? { ...data, settings: next } : data); refresh(); }}
              />
            ) : <p className="text-[12px] text-neutral-muted">불러오는 중…</p>}
            <div className="mt-6 border-t border-neutral-1000-a05 pt-4">
              <p className="mb-2 text-[13px] font-medium">링크드인 지원자 파일 올리기</p>
              <AgentApplicantUpload writes={writes} onImported={refresh} />
            </div>
          </div>
        ) : null}
      </section>

      <Panel
        title="수치"
        actions={(
          <span className="flex items-center gap-2">
            <span className="w-32"><Select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              {PERIODS.map((value) => <option key={value} value={value}>최근 {value}일</option>)}
            </Select></span>
            <Button className="whitespace-nowrap" loading={overview.loading} onClick={refresh}>새로고침</Button>
          </span>
        )}
      >
        <ErrorNotice message={overview.error} />
        {data ? <AgentFunnelTable funnel={data.funnel} /> : overview.loading ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
      </Panel>

      <Panel
        title="로그"
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
        {logTab === "sent" ? <AgentLog days={days} source={null} includeTest={includeTest} refreshKey={refreshKey} /> : null}
        {logTab === "people" ? <AgentPeople includeTest={includeTest} refreshKey={refreshKey} source={null} /> : null}
        {logTab === "runs" ? <RunList runs={data?.runs ?? []} /> : null}
      </Panel>
    </div>
  );
}
