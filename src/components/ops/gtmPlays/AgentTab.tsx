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
import AgentQueue from "./agent/AgentQueue";
import AgentSettingsForm, { agentSenderWarning } from "./agent/AgentSettingsForm";
import { sourceLabel, usd } from "./agent/labels";
import { formatKst, useGtmAction } from "./api";
import { Badge, Button, ErrorNotice, Panel, Select } from "./ui";

type Overview = { settings: AgentSettings; funnel: AgentFunnel; runs: AgentRun[] };

const PERIODS = [7, 30, 90] as const;
const RUN_KIND: Record<AgentRun["kind"], string> = { daily: "매일 실행", import: "지원자 파일", manual: "지금 실행" };
const RUN_STATUS: Record<AgentRun["status"], string> = {
  queued: "대기", running: "실행 중", done: "끝남", failed: "실패", stopped: "중지",
};
const COUNT_LABEL: Record<string, string> = {
  found: "찾음", excluded: "제외", no_fit: "맞는 회사 없음", matched: "공고 고름", drafted: "메일 씀", sent: "보냄",
  failed: "실패", stopped_cost_cap: "비용 상한에서 멈춤", errors: "오류",
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
 * needs to run it (Shaun 11/17): the settings and the stop switch on top, then the numbers and the log, all per source
 * (picked at the top), then the applicant upload, approvals and replies, and everyone found.
 */
export default function AgentTab({ writes }: { writes: boolean }) {
  const [days, setDays] = useState<number>(30);
  const [includeTest, setIncludeTest] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stopArmed, setStopArmed] = useState(false);
  const [testRun, setTestRun] = useState(true);
  const overview = useGtmAction<Overview>();
  const runAction = useGtmAction<{ run: AgentRun }>();
  const stopAction = useGtmAction<{ settings: AgentSettings; stoppedRuns: number }>();
  const { run } = overview;
  const load = useCallback(() => { void run("agent.overview", { days, includeTest }); }, [run, days, includeTest]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const refresh = () => setRefreshKey((key) => key + 1);
  const data = overview.result;
  const settings = data?.settings ?? null;
  const senderWarning = settings ? agentSenderWarning(settings.senderName, settings.senderEmail) : null;
  const sources = data ? Object.keys(data.funnel.bySource) : [];
  const stop = async () => {
    if (!stopArmed) { setStopArmed(true); return; }
    setStopArmed(false);
    if (await stopAction.run("agent.stop")) refresh();
  };
  return (
    <div className="space-y-5">
      <section className={cx(opsTheme.panel, "space-y-3 p-4 shadow-sm")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {settings ? <Badge tone={settings.enabled ? "positive" : "default"}>{settings.enabled ? "켜짐" : "꺼짐"}</Badge> : null}
            {settings ? (
              <span className="text-neutral-muted">
                {settings.sendMode === "auto" ? "자동으로 보내기" : "보내기 전 승인"} · {settings.senderName ?? "보내는 사람 없음"}{settings.senderEmail ? ` <${settings.senderEmail}>` : ""}
                {" "}· 하루 메일 {settings.dailyMailCap}통 · 비용 상한 {usd(settings.dailyCostUsd)} · {settings.sendStartHour}~{settings.sendEndHour}시 · 설정 v{settings.version}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 whitespace-nowrap text-[12px]">
              <input type="checkbox" checked={testRun} onChange={(event) => setTestRun(event.target.checked)} />
              테스트 실행
            </label>
            <Button
              loading={runAction.loading}
              disabled={!writes}
              onClick={async () => { if (await runAction.run("agent.run.start", { isTest: testRun })) refresh(); }}
            >
              지금 실행
            </Button>
            <Button
              className={stopArmed ? "bg-critical-faded text-critical" : undefined}
              loading={stopAction.loading}
              onClick={() => void stop()}
              onBlur={() => setStopArmed(false)}
            >
              {stopArmed ? "한 번 더 누르면 멈춰요" : "즉시 중지"}
            </Button>
            <Button onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen}>
              설정 {settingsOpen ? <ChevronUp className="ml-1 inline h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="ml-1 inline h-3.5 w-3.5" aria-hidden />}
            </Button>
          </div>
        </div>
        {senderWarning ? <p className={opsTheme.errorNotice}>{senderWarning}</p> : null}
        {settings && !settings.enabled ? (
          <p className="text-[12px] text-neutral-muted">에이전트가 꺼져 있으면 찾기·보내기 모두 멈춰 있어요. 설정에서 켜요.</p>
        ) : null}
        <ErrorNotice message={runAction.error ?? stopAction.error} />
        {stopAction.result ? <p className={opsTheme.successNotice}>멈췄어요. 실행 {stopAction.result.stoppedRuns}개를 중지했어요.</p> : null}
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
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-neutral-muted">소스</span>
        {[null, ...sources].map((id) => (
          <button
            key={id ?? "all"}
            type="button"
            onClick={() => setSource(id)}
            className={cx("rounded-full border px-3 py-1", source === id ? "border-neutral-primary bg-bg-weak font-medium" : "border-neutral-1000-a05 text-neutral-muted hover:bg-bg-weak/70")}
          >
            {id ? sourceLabel(id) : "전체"}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 whitespace-nowrap">
            <input type="checkbox" checked={includeTest} onChange={(event) => setIncludeTest(event.target.checked)} />
            테스트 포함
          </label>
          <Select value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-32">
            {PERIODS.map((value) => <option key={value} value={value}>최근 {value}일</option>)}
          </Select>
          <Button className="whitespace-nowrap" loading={overview.loading} onClick={refresh}>새로고침</Button>
        </span>
      </div>

      <Panel title={source ? `숫자 · ${sourceLabel(source)}` : "숫자"}>
        <ErrorNotice message={overview.error} />
        {data ? <AgentFunnelTable funnel={data.funnel} source={source} onSource={setSource} /> : overview.loading ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] text-neutral-muted">최근 실행 {data?.runs.length ?? 0}개</summary>
          <div className="mt-2"><RunList runs={data?.runs ?? []} /></div>
        </details>
      </Panel>

      <Panel title={source ? `로그 · ${sourceLabel(source)}` : "로그"}>
        <AgentLog days={days} source={source} includeTest={includeTest} refreshKey={refreshKey} />
      </Panel>

      <Panel title="링크드인 지원자 올리기">
        <AgentApplicantUpload writes={writes} onImported={refresh} />
      </Panel>

      <Panel title="승인 기다리는 메일 · 답장">
        <AgentQueue includeTest={includeTest} writes={writes} refreshKey={refreshKey} onChanged={refresh} />
      </Panel>

      <Panel title={source ? `사람 · ${sourceLabel(source)}` : "사람"}>
        <AgentPeople includeTest={includeTest} refreshKey={refreshKey} source={source} />
      </Panel>
    </div>
  );
}
