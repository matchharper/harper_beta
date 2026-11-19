import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { AgentSearchLine, AgentSearchLogLine, AgentUploadLine } from "@/lib/gtmPlays/agent/log.server";
import type { AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import {
  DEMAND_LEVEL_LABEL, MIN_DEMAND_COMPANIES, ROLE_FAMILY_LABEL, demandFamilies, isRoleFamily, placeLabel, thinFamilies,
  type DemandSummary,
} from "@/lib/gtmPlays/agent/demand";
import { EXPLORE_SOURCE, queryFamily } from "@/lib/gtmPlays/agent/signals";
import { formatKst, useGtmAction } from "../api";
import { ErrorNotice, Select } from "../ui";
import { shortConfigId } from "@/lib/gtmPlays/agent/config";
import { ConfigLine } from "./AgentConfig";
import { DayChip, LogSplit, LogTable, PersonCell, type LogRowView } from "./AgentLogTable";
import type { FoundBy } from "./AgentPeople";
import { sourceLabel, usd } from "./labels";

const STAGE_WORD: Record<string, string> = {
  signal: "구직 글 찾기", explore: "목록 밖 웹 찾기", layoff_news: "감원 뉴스 찾기", layoff_people: "감원 회사 사람 찾기",
};

const keyOf = (line: AgentSearchLogLine) => `${line.kind}:${line.runId}:${line.kind === "search" ? line.source : ""}`;

/** "새 사람 N명": a link to the 사람 log of exactly the people this search or file found. */
function NewPeopleLink({ count, onShow }: { count: number; onShow: () => void }) {
  if (!count) return <span>새 사람 0명</span>;
  return (
    <button type="button" className={cx(opsTheme.link, "font-medium")} onClick={(event) => { event.stopPropagation(); onShow(); }}>
      새 사람 {count}명
    </button>
  );
}

/** What the judge did with a search's pages, in words ("" when the log is from before these were counted). */
function judgeSummary(yields: NonNullable<AgentSearchLine["log"]>["yields"]): string {
  const people = yields.filter((item) => item.stage !== "layoff_news");
  const sum = (pick: (item: (typeof people)[number]) => number | undefined) => people.reduce((total, item) => total + (pick(item) ?? 0), 0);
  if (!people.some((item) => item.raw !== undefined)) return "";
  const parts: Array<[string, number]> = [
    ["검색 결과", sum((item) => item.raw)], ["전에 본 페이지라 건너뜀", sum((item) => item.knownUrls)], ["판정", sum((item) => item.results)],
    ["새 사람", sum((item) => item.kept)], ["구직 글 아님", sum((item) => item.rejected)], ["점수 모자람", sum((item) => item.belowScore)],
    ["공고 맞을 가능성 낮음", sum((item) => item.lowMatch)],
    ["누군지 알 수 없음", sum((item) => item.notIdentifiable)], ["이미 찾은 사람", sum((item) => item.known)],
    ["검색 오류", people.filter((item) => item.error).length],
  ];
  return parts.filter(([label, value]) => value > 0 || label === "새 사람").map(([label, value]) => `${label} ${value}`).join(" · ");
}

const familyWord = (family: string | undefined) => (family && isRoleFamily(family) ? ROLE_FAMILY_LABEL[family] : null);

/**
 * 오늘 노린 사람: the open postings the run read (what Harper can propose that day) by 직무, and how many of this
 * search's queries went to each; the 직무 with too few companies hiring were not searched.
 */
function DemandAim({ demand, yields }: { demand: DemandSummary; yields: NonNullable<AgentSearchLine["log"]>["yields"] }) {
  const aimed = demandFamilies(demand);
  const thin = thinFamilies(demand).map((family) => ROLE_FAMILY_LABEL[family]);
  const queries = new Map<string, Set<string>>();
  for (const item of yields.filter((row) => row.stage !== "layoff_news")) {
    const family = queryFamily(item);
    queries.set(family, (queries.get(family) ?? new Set()).add(item.query));
  }
  const mixed = queries.get("mixed")?.size ?? 0;
  return (
    <div>
      <p className="mb-1 font-medium text-neutral-muted">오늘 노린 사람</p>
      <p>
        하퍼가 {demand.day}에 추천할 수 있던 공고 {demand.postings}개({demand.companies}개 회사, 고객사 공고 {demand.internal}개 포함)에 맞는 경력으로,
        이직이나 구직 중이라고 쓴 사람을 찾았어요. 사람마다 확실히 맞는 공고가 1곳 이상 있어야 메일을 보내서, 채용 중인 회사가 많은 직무에 검색어를 더 썼어요.
        {thin.length ? ` 채용 중인 회사가 ${MIN_DEMAND_COMPANIES}곳이 안 되는 직무(${thin.join(", ")})는 찾지 않았어요.` : ""}
      </p>
      {aimed.length ? (
        <table className="mt-1 w-full table-fixed">
          <thead className="text-left text-neutral-muted">
            <tr>
              <th className="w-24 py-1 pr-2 font-normal">직무</th><th className="w-14 py-1 text-right font-normal">회사</th>
              <th className="w-12 py-1 text-right font-normal">공고</th><th className="py-1 pl-3 font-normal">주로</th>
              <th className="w-14 py-1 text-right font-normal">검색어</th>
            </tr>
          </thead>
          <tbody className={cx("divide-y", opsTheme.divider)}>
            {aimed.map((item) => {
              const top = item.segments[0];
              const where = top ? `${DEMAND_LEVEL_LABEL[top.level]} · ${placeLabel(top.place)}` : "";
              const industries = item.industries.map((entry) => entry.industry).join(", ");
              return (
                <tr key={item.family} className="align-top" title={item.examples.join(" / ")}>
                  <td className="py-1 pr-2">{ROLE_FAMILY_LABEL[item.family]}</td>
                  <td className="py-1 text-right tabular-nums">{item.companies}곳</td>
                  <td className="py-1 text-right tabular-nums">{item.postings}</td>
                  <td className="py-1 pl-3 break-words text-neutral-muted">{[where, industries].filter(Boolean).join(" · ")}</td>
                  <td className="py-1 text-right tabular-nums">{queries.get(item.family)?.size ?? 0}개</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {mixed ? <p className="mt-1 text-neutral-muted">여러 직무에 걸친 검색어 {mixed}개</p> : null}
    </div>
  );
}

/** A search's detail: what the run aimed at, each round's plan and reason, its searches with what they gave, kept examples, new domains. */
function SearchDetail({ line, onClose }: { line: AgentSearchLine; onClose: () => void }) {
  const log = line.log;
  const judged = log ? judgeSummary(log.yields) : "";
  return (
    <div className={cx(opsTheme.panelSoft, "min-w-0 space-y-3 break-words p-4 text-[12px]")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{line.source ? `${sourceLabel(line.source)} 검색` : "실행"}</p>
          <p className="text-neutral-muted">{formatKst(line.at)} · 검색 {line.searches}번 · 새 사람 {line.newPeople}명 · 이미 아는 사람 {line.knownPeople}명 · {usd(line.costUsd)}</p>
          <ConfigLine id={line.configId} />
        </div>
        <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {line.error ? <p className="text-critical">{line.error}</p> : null}
      {line.skippedBudget ? <p className="text-neutral-muted">오늘 이 검색에 배분된 예산이 없어서 건너뛰었어요.</p> : null}
      {line.cutOff ? <p className="text-neutral-muted">시간이 모자라 중간에 멈췄어요. 다음 실행에서 이어서 해요(본 페이지는 건너뛰어요).</p> : null}
      {line.demand?.postings && line.source ? <DemandAim demand={line.demand} yields={log?.yields ?? []} /> : null}
      {log?.plans.length ? (
        <div className="space-y-1.5">
          <p className="font-medium text-neutral-muted">검색 계획</p>
          {log.plans.map((plan, index) => (
            <div key={index}>
              <p className="font-medium">{index + 1}번째{plan.stage ? ` · ${STAGE_WORD[plan.stage] ?? plan.stage}` : ""}</p>
              {plan.reason ? <p className="text-neutral-muted">이유: {plan.reason}</p> : null}
              <p className="whitespace-pre-line text-neutral-primary">{plan.plan}</p>
            </div>
          ))}
        </div>
      ) : null}
      {log?.yields.length ? (
        <div>
          <p className="mb-1 font-medium text-neutral-muted">검색어와 결과</p>
          <table className="w-full table-fixed">
            <thead className="text-left text-neutral-muted">
              <tr><th className="py-1 pr-2 font-normal">검색어</th><th className="w-12 py-1 text-right font-normal">결과</th><th className="w-12 py-1 text-right font-normal">남김</th><th className="w-16 py-1 text-right font-normal">연락처</th></tr>
            </thead>
            <tbody className={cx("divide-y", opsTheme.divider)}>
              {log.yields.map((item, index) => (
                <tr key={index} className="align-top">
                  <td className="py-1 pr-2 break-words">
                    {item.query}{item.window ? <span className="text-neutral-muted"> · {item.window}</span> : null}
                    {familyWord(item.family) ? <span className="text-neutral-muted"> · {familyWord(item.family)}</span> : null}
                  </td>
                  <td className="py-1 text-right tabular-nums">{item.error ? <span className="text-critical">오류</span> : item.results}</td>
                  <td className="py-1 text-right tabular-nums">{item.kept}</td>
                  <td className="py-1 text-right tabular-nums">{item.withContact ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {judged ? <p className="mt-1 text-neutral-muted">{judged}</p> : null}
        </div>
      ) : null}
      {log?.keptSamples.length ? (
        <div>
          <p className="mb-1 font-medium text-neutral-muted">남긴 사람 예시</p>
          <ul className="space-y-0.5">{log.keptSamples.map((sample, index) => <li key={index}>{sample}</li>)}</ul>
        </div>
      ) : null}
      {line.newDomains.length ? (
        <p><span className="font-medium text-neutral-muted">사람을 찾은 새 도메인</span> {line.newDomains.map((item) => `${item.domain} ${item.kept}명`).join(" · ")}</p>
      ) : null}
    </div>
  );
}

function UploadDetail({ line, onClose }: { line: AgentUploadLine; onClose: () => void }) {
  return (
    <div className={cx(opsTheme.panelSoft, "min-w-0 space-y-2 break-words p-4 text-[12px]")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">링크드인 지원자 파일</p>
          <p className="text-neutral-muted">{formatKst(line.at)}{line.fileName ? ` · ${line.fileName}` : ""}</p>
          <ConfigLine id={line.configId} />
        </div>
        <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {line.error ? <p className="text-critical">{line.error}</p> : null}
      <p>{uploadCounts(line)}</p>
      <p>이 사람들의 지금 단계: 처리 중 {line.stages.working}명 · 제외 {line.stages.excluded}명 · 연락 {line.stages.contacted}명 (답장 {line.stages.replied}명)</p>
    </div>
  );
}

function uploadCounts(line: AgentUploadLine) {
  const parts = [line.rows !== null ? `파일 ${line.rows}명` : null, `새 사람 ${line.newPeople}명`,
    line.alreadyKnown !== null ? `이미 있음 ${line.alreadyKnown}명` : null, line.withEmail !== null ? `메일 주소 있음 ${line.withEmail}명` : null];
  return parts.filter(Boolean).join(" · ");
}

/**
 * 로그 · 검색: what only this tab shows (Shaun 11/17): each search (a site in a run) with what it searched, what it found
 * and cost, and each uploaded applicant file with what came of its people. 새 사람 opens those people on the 사람 tab.
 */
export default function AgentSearchLog({
  period, includeTest, refreshKey, sources, source, onSource, day = null, onDay, config = null, onConfig, onShowPeople,
}: {
  /** The log's period (최근 N일 or a KST date range). */
  period: AgentPeriodInput; includeTest: boolean; refreshKey: number; sources: string[];
  source: string | null; onSource: (source: string | null) => void;
  /** One KST day (a 하루별 성능 비용 click) instead of the period, shown as a chip. */
  day?: string | null; onDay?: (day: string | null) => void;
  /** Only the searches (and files) of one 설정 묶음 (a 하루별 성능 click under its filter), shown as a chip. */
  config?: string | null; onConfig?: (config: string | null) => void;
  onShowPeople: (found: FoundBy) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const list = useGtmAction<{ lines: AgentSearchLogLine[] }>();
  const { run } = list;
  const load = useCallback(() => {
    void run("agent.searches", { ...(day ? { from: day, to: day } : period), includeTest });
  }, [run, period, day, includeTest]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const all = list.result?.lines ?? [];
  const lines = all
    .filter((line) => !source || (line.kind === "search" ? line.source === source : source === "linkedin"))
    .filter((line) => !config || line.configId === config);
  const open = lines.find((line) => keyOf(line) === selected) ?? null;
  const views: LogRowView[] = lines.map((line) => {
    if (line.kind === "upload") {
      return {
        key: keyOf(line), at: line.at,
        person: <PersonCell name="링크드인 지원자 파일" intro={line.fileName} />,
        source: sourceLabel("linkedin"),
        stage: (
          <span className="text-[12px]">
            <NewPeopleLink count={line.newPeople} onShow={() => onShowPeople({ id: line.runId, source: null, tuningVersion: null, label: `${formatKst(line.at)} 지원자 파일에서 찾은 사람` })} />
          </span>
        ),
        content: (
          <div className="space-y-0.5 text-[12px]">
            <p>{uploadCounts(line)}</p>
            <p className="text-neutral-muted">처리 중 {line.stages.working} · 제외 {line.stages.excluded} · 연락 {line.stages.contacted} (답장 {line.stages.replied})</p>
            {line.error ? <p className="text-critical">{line.error}</p> : null}
          </div>
        ),
      };
    }
    const first = line.log?.plans[0];
    const label = line.source === EXPLORE_SOURCE ? "목록 밖 웹 검색" : "사이트 검색";
    return {
      key: keyOf(line), at: line.at,
      person: <PersonCell name={line.source ? label : "실행"} intro={line.source ? null : "검색 없이 끝난 실행"} />,
      source: line.source ? sourceLabel(line.source) : "—",
      stage: line.source ? (
        <span className="text-[12px]">
          검색 {line.searches}번 · <NewPeopleLink count={line.newPeople} onShow={() => onShowPeople({
            id: line.runId, source: line.source, tuningVersion: line.log?.tuningVersion ?? null,
            label: `${formatKst(line.at)} ${sourceLabel(line.source)} 검색에서 찾은 사람`,
          })} />
          {line.knownPeople ? <span className="text-neutral-muted"> (이미 아는 사람 {line.knownPeople}명)</span> : null}
        </span>
      ) : <span className="text-[12px] text-neutral-muted">—</span>,
      content: (
        <div className="min-w-0 space-y-0.5 text-[12px]">
          {first ? <p className="line-clamp-1">{(first.reason ?? first.plan).slice(0, 200)}</p> : null}
          {line.skippedBudget ? <p className="text-neutral-muted">오늘 배분된 예산이 없어 건너뜀</p> : null}
          {line.newDomains.length ? <p className="line-clamp-1 text-neutral-muted">새 도메인: {line.newDomains.slice(0, 5).map((item) => `${item.domain} ${item.kept}명`).join(" · ")}</p> : null}
          <p className="text-neutral-muted">비용 {usd(line.costUsd)}</p>
          {line.error ? <p className="text-critical">{line.error}</p> : null}
        </div>
      ),
    };
  });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-neutral-muted">찾은 곳</span>
        <span className="w-36 shrink-0">
          <Select value={source ?? ""} onChange={(event) => onSource(event.target.value || null)} className="w-36">
            <option value="">전체</option>
            {sources.map((value) => <option key={value} value={value}>{sourceLabel(value)}</option>)}
          </Select>
        </span>
        {day ? <DayChip day={day} onClear={() => onDay?.(null)} /> : null}
        {config ? (
          <span className="flex items-center gap-1 rounded-full border border-neutral-1000-a10 bg-bg-weak px-2.5 py-0.5 text-[12px]">
            설정 묶음 {shortConfigId(config)}
            <button type="button" aria-label={`설정 묶음 ${shortConfigId(config)} 빼기`} onClick={() => onConfig?.(null)} className="text-neutral-muted hover:text-neutral-primary">×</button>
          </span>
        ) : null}
        <span className="text-neutral-muted">{lines.length}줄</span>
      </div>
      <ErrorNotice message={list.error} />
      <LogSplit
        detail={open ? (open.kind === "search"
          ? <SearchDetail key={keyOf(open)} line={open} onClose={() => setSelected(null)} />
          : <UploadDetail key={keyOf(open)} line={open} onClose={() => setSelected(null)} />) : null}
        list={(
          <LogTable
            rows={views}
            selected={selected}
            onSelect={setSelected}
            loading={list.loading}
            personHeader="무엇"
            empty={config ? "이 기간에 이 설정 묶음으로 한 검색이 없어요." : source ? "이 기간에 이곳을 검색한 기록이 없어요." : "이 기간에 검색이나 올린 파일이 없어요. 에이전트가 사이트마다 검색한 결과와 올린 지원자 파일이 여기에 쌓여요."}
          />
        )}
      />
    </div>
  );
}
