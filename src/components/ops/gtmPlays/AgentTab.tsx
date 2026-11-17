import { useCallback, useEffect, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { AgentRun } from "@/lib/gtmPlays/agent/store.server";
import type { AgentSettings } from "@/lib/gtmPlays/agent/types";
import type { AgentFunnel } from "@/lib/gtmPlays/agent/views.server";
import AgentFunnelTable from "./agent/AgentFunnelTable";
import AgentImport from "./agent/AgentImport";
import AgentPeople from "./agent/AgentPeople";
import AgentQueue from "./agent/AgentQueue";
import AgentRolePanel from "./agent/AgentRolePanel";
import AgentSettingsForm, { agentSenderWarning } from "./agent/AgentSettingsForm";
import { usd } from "./agent/labels";
import { formatKst, useGtmAction } from "./api";
import { Badge, Button, ErrorNotice, Panel, Select } from "./ui";

type Overview = { settings: AgentSettings; funnel: AgentFunnel; runs: AgentRun[] };

const PERIODS = [7, 30, 90] as const;
const RUN_KIND: Record<AgentRun["kind"], string> = { daily: "매일 실행", import: "지원자 올리기", manual: "지금 실행", role: "Role로 찾기" };
const RUN_STATUS: Record<AgentRun["status"], string> = {
  queued: "대기", running: "실행 중", done: "끝남", failed: "실패", stopped: "중지",
};
const COUNT_LABEL: Record<string, string> = {
  found: "찾음", excluded: "제외", no_fit: "맞는 회사 없음", matched: "공고 고름", drafted: "초안", sent: "보냄",
  queued_human: "사람이 보낼 목록", failed: "실패",
  searched_member: "회원 검색", role_found_member: "회원 찾음", role_known_member: "회원 이미 있음",
  searched_scraped: "스크랩 검색", role_found_scraped: "스크랩 찾음", role_known_scraped: "스크랩 이미 있음",
  external_requested: "외부 검색 요청", external_candidates: "외부 후보", external_lookups: "이메일 찾기 요청",
  role_found_external: "외부 찾음", external_no_email: "이메일 못 찾음", external_not_queued: "외부 검색 못 함",
  external_cost: "외부 비용($)",
};

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
              {Object.entries(run.counts).filter(([, count]) => count).map(([key, count]) => `${COUNT_LABEL[key] ?? key} ${count}`).join(" · ") || "—"}
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
 * GTM 플레이 #5 후보자 소싱 에이전트: the agent finds people showing they are looking (LinkedIn applicants, #OpenToWork,
 * Threads posts), proposes 2-3 fitting postings, mails them or lines up a message a person sends by hand. This tab
 * shows the numbers, every person's timeline, the hand-send list, the settings, the applicant upload and the run
 * controls.
 */
export default function AgentTab({ writes }: { writes: boolean }) {
  const [days, setDays] = useState<number>(30);
  const [includeTest, setIncludeTest] = useState(false);
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
  const stop = async () => {
    if (!stopArmed) { setStopArmed(true); return; }
    setStopArmed(false);
    if (await stopAction.run("agent.stop")) refresh();
  };
  return (
    <div className="space-y-5">
      <Panel
        title="실행"
        actions={(
          <>
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
              {stopArmed ? "한 번 더 누르면 멈춰요" : "긴급 중지"}
            </Button>
          </>
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
          {settings ? (
            <Badge tone={settings.enabled ? "positive" : "default"}>{settings.enabled ? "켜짐" : "꺼짐"}</Badge>
          ) : null}
          {settings ? (
            <span className="text-neutral-muted">
              {settings.senderName ?? "보내는 사람 없음"} {settings.senderEmail ? `<${settings.senderEmail}>` : ""} · 하루 메일 {settings.dailyMailCap}통 · 비용 상한 {usd(settings.dailyCostUsd)} · {settings.sendStartHour}~{settings.sendEndHour}시 · 승인 {settings.approvalRequired ? "필요" : "없음"}
            </span>
          ) : null}
        </div>
        {senderWarning ? <p className={cx(opsTheme.errorNotice, "mb-3")}>{senderWarning}</p> : null}
        {settings && !settings.enabled ? (
          <p className="mb-3 text-[12px] text-neutral-muted">에이전트가 꺼져 있으면 지금 실행과 올린 지원자도 기다려요. 아래 설정에서 켜요.</p>
        ) : null}
        <ErrorNotice message={runAction.error ?? stopAction.error} />
        {stopAction.result ? <p className={cx(opsTheme.successNotice, "mb-3")}>멈췄어요. 실행 {stopAction.result.stoppedRuns}개를 중지했어요.</p> : null}
        <RunList runs={data?.runs ?? []} />
      </Panel>

      <Panel
        title="숫자"
        actions={(
          <>
            <label className="flex items-center gap-2 whitespace-nowrap text-[12px]">
              <input type="checkbox" checked={includeTest} onChange={(event) => setIncludeTest(event.target.checked)} />
              테스트 포함
            </label>
            <Select value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-32">
              {PERIODS.map((value) => <option key={value} value={value}>최근 {value}일</option>)}
            </Select>
            <Button loading={overview.loading} onClick={refresh}>새로고침</Button>
          </>
        )}
      >
        <ErrorNotice message={overview.error} />
        {data ? <AgentFunnelTable funnel={data.funnel} /> : overview.loading ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
      </Panel>

      <Panel title="Role로 사람 찾기">
        <AgentRolePanel writes={writes} includeTest={includeTest} agentOn={Boolean(settings?.enabled)} refreshKey={refreshKey} onStarted={refresh} />
      </Panel>

      <Panel title="사람이 보낼 메시지 · 승인 대기 · 답장">
        <AgentQueue includeTest={includeTest} writes={writes} refreshKey={refreshKey} onChanged={refresh} />
      </Panel>

      <Panel title="사람 (타임라인)">
        <AgentPeople includeTest={includeTest} refreshKey={refreshKey} />
      </Panel>

      <Panel title="링크드인 Recruiter 지원자 올리기">
        <AgentImport writes={writes} onImported={refresh} />
      </Panel>

      <Panel title="설정">
        {settings ? (
          <AgentSettingsForm
            key={settings.updatedAt ?? "defaults"}
            settings={settings}
            writes={writes}
            onSaved={(next) => { overview.setResult(data ? { ...data, settings: next } : data); refresh(); }}
          />
        ) : <p className="text-[12px] text-neutral-muted">불러오는 중…</p>}
      </Panel>
    </div>
  );
}
