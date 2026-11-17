import { cx } from "@/components/ops/theme";
import { agentRate, type AgentFunnelNumbers } from "@/lib/gtmPlays/agent/funnel";
import { ratePercent } from "@/lib/gtmPlays/rate";
import type { AgentFunnel } from "@/lib/gtmPlays/agent/views.server";
import type { AgentExcludeReason } from "@/lib/gtmPlays/agent/types";
import { Hint } from "../ui";
import { EXCLUDE_LABEL, sourceLabel, usd } from "./labels";

/** What each number counts (ⓘ), with the formula where a % is shown. */
const HINTS = {
  source: "그 사람을 발굴한 곳(도메인)이에요. 링크드인에는 올린 지원자 파일과 구직 글·프로필이, Role로 찾은 사람은 그 사람 프로필이 있는 곳이(하퍼 회원은 '하퍼 회원') 들어가요. 어떻게 찾았는지는 로그에 있어요.",
  found: "기간 안에 에이전트가 찾은 사람 수예요. 같은 사람은 한 번만 세요.",
  excluded: "일부러 연락하지 않은 사람이에요. 이미 하퍼 회원, 30일 안에 #4·#5로 연락함, 수신 거부·반송, 14일 지난 글 등이에요. 숫자에 마우스를 올리면 이유별로 보여요.",
  noFit: "맞는 회사가 2곳이 안 돼서 연락하지 않은 사람이에요. 기록만 남겨요.",
  waiting: "연락할 준비가 됐지만 아직 안 나간 사람이에요(보내는 시간·하루 한도·승인을 기다림).",
  contacted: "메일이 나간 사람이에요(연락은 이메일로만 해요). %는 연락 ÷ 찾음이에요.",
  clicked: "메시지의 하퍼 링크를 열어 페이지가 1초 넘게 화면에 있었던 사람이에요(가입한 사람도 포함). %는 클릭 ÷ 연락이에요.",
  signedUp: "그 링크로 가입(또는 로그인)하고 온보딩까지 마친 사람이에요. 괄호 안은 가입률 = 가입 ÷ 연락이에요.",
  interested: "제안한 공고를 저장·지원·연결·오퍼·수락까지 한 사람이에요.",
  connected: "제안한 공고의 회사와 하퍼에서 연결된 사람이에요. 최종 목표 숫자예요.",
  replied: "답장이 온 사람이에요. 메일 답장은 Ops가 '답장 옴'으로 남긴 것만 세요.",
  cost: "그 사람들을 찾고(검색) 맞는 공고를 고르고 메일을 쓰는 데 쓴 돈이에요. 검색 비용은 찾은 곳 줄에 들어가요.",
} as const;

function HeaderLabel({ label, hint, align = "right" }: { label: string; hint: string; align?: "left" | "right" }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap", align === "right" ? "justify-end" : "justify-start")}>
      {align === "right" ? <Hint label={label} text={hint} /> : null}
      {label}
      {align === "right" ? null : <Hint label={label} text={hint} />}
    </span>
  );
}

function Count({ n, rate, title, strong }: { n: number; rate?: number | null; title?: string; strong?: boolean }) {
  return (
    <span className="whitespace-nowrap tabular-nums" title={title}>
      <span className={strong ? "font-medium" : undefined}>{n}</span>
      {rate !== undefined && rate !== null ? <span className="ml-1 text-[11px] text-neutral-muted">· {rate}%</span> : null}
    </span>
  );
}

const excludedTitle = (by: AgentFunnelNumbers["excludedBy"]) => Object.entries(by)
  .map(([reason, count]) => `${EXCLUDE_LABEL[reason as AgentExcludeReason] ?? reason} ${count}`).join(" · ") || undefined;

function Row({ label, numbers, strong, selected, onClick }: {
  label: string; numbers: AgentFunnelNumbers; strong?: boolean; selected?: boolean; onClick?: () => void;
}) {
  const cell = "px-2 py-1.5 text-right align-top";
  return (
    <tr className={cx(strong && "font-medium", onClick && "cursor-pointer hover:bg-bg-weak/70", selected && "bg-bg-weak")} onClick={onClick}>
      <td className="py-1.5 pr-3">{label}</td>
      <td className={cell}><Count n={numbers.found} strong={strong} /></td>
      <td className={cell}><Count n={numbers.excluded} title={excludedTitle(numbers.excludedBy)} /></td>
      <td className={cell}><Count n={numbers.noFit} /></td>
      <td className={cell}><Count n={numbers.waiting} /></td>
      <td className={cell}><Count n={numbers.contacted} rate={agentRate(numbers.contacted, numbers.found)} /></td>
      <td className={cell}><Count n={numbers.clicked} rate={agentRate(numbers.clicked, numbers.contacted)} /></td>
      <td className={cell}>
        <span className="whitespace-nowrap tabular-nums">
          <span className="font-medium">{numbers.signedUp}</span>
          <span className="ml-1 text-[12px] text-neutral-muted">({ratePercent(numbers.signedUp, numbers.contacted)})</span>
        </span>
      </td>
      <td className={cell}><Count n={numbers.interested} /></td>
      <td className={cell}><Count n={numbers.connected} strong /></td>
      <td className={cell}><Count n={numbers.replied} /></td>
      <td className={cx(cell, "tabular-nums text-neutral-muted")}>{usd(numbers.costUsd)}</td>
    </tr>
  );
}

/**
 * #5 숫자: per source (where the person was found) and in total, found → … → connected, and today's mails and spend
 * against the caps; with a source picked, the chips are that source's and its row is marked.
 */
export default function AgentFunnelTable({ funnel, source, onSource }: {
  funnel: AgentFunnel; source: string | null; onSource: (source: string | null) => void;
}) {
  const { today } = funnel;
  const picked = source ? today.bySource[source] ?? { mailsSent: 0, costUsd: 0 } : null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
        <span
          className="rounded-md bg-bg-weak px-2.5 py-1 font-medium"
          title="고른 기간(한국 시간 날짜) 동안 에이전트가 쓴 돈: 사람 찾기 검색 + 공고 고르기 + 메일·메시지 쓰기. 하루마다 실행 기록에 쌓인 비용의 합이에요."
        >
          최근 {funnel.period.days}일 쓴 비용 {usd(funnel.period.costUsd)}
          {funnel.period.testCostUsd > 0 ? ` (테스트 ${usd(funnel.period.testCostUsd)} ${funnel.period.includesTest ? "포함" : "별도"})` : ""}
        </span>
        {picked && source ? (
          <>
            <span className="rounded-md bg-bg-weak px-2.5 py-1 font-medium">{sourceLabel(source)} · 기간 비용 {usd(funnel.bySource[source]?.costUsd ?? 0)}</span>
            <span className="rounded-md bg-bg-weak px-2.5 py-1">{sourceLabel(source)} 오늘 비용 {usd(picked.costUsd)} (전체 {usd(today.costUsd)} / 상한 {usd(today.costCapUsd)})</span>
            <span className="rounded-md bg-bg-weak px-2.5 py-1">{sourceLabel(source)} 오늘 메일 {picked.mailsSent}통 (전체 {today.mailsSent} / 한도 {today.mailCap}통)</span>
          </>
        ) : (
          <>
            <span className={cx("rounded-md px-2.5 py-1", today.costUsd >= today.costCapUsd ? "bg-critical-faded text-critical" : "bg-bg-weak")}>
              오늘 비용 {usd(today.costUsd)} / 상한 {usd(today.costCapUsd)}
            </span>
            <span className={cx("rounded-md px-2.5 py-1", today.mailsSent >= today.mailCap ? "bg-critical-faded text-critical" : "bg-bg-weak")}>
              오늘 메일 {today.mailsSent}통 / 한도 {today.mailCap}통
            </span>
          </>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="text-left text-[12px] text-neutral-muted">
            <tr>
              <th className="py-1.5 pr-3 font-normal"><HeaderLabel label="찾은 곳" hint={HINTS.source} align="left" /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="찾음" hint={HINTS.found} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="제외" hint={HINTS.excluded} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="맞는 회사 없음" hint={HINTS.noFit} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="대기" hint={HINTS.waiting} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="연락" hint={HINTS.contacted} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="클릭" hint={HINTS.clicked} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="가입 (가입률)" hint={HINTS.signedUp} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="관심·지원" hint={HINTS.interested} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="회사 연결" hint={HINTS.connected} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="답장" hint={HINTS.replied} /></th>
              <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="비용" hint={HINTS.cost} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-1000-a05">
            {Object.entries(funnel.bySource).map(([id, numbers]) => (
              <Row key={id} label={sourceLabel(id)} numbers={numbers} selected={source === id} onClick={() => onSource(source === id ? null : id)} />
            ))}
            <Row label="합계" numbers={funnel.total} strong selected={!source} onClick={() => onSource(null)} />
          </tbody>
        </table>
      </div>
      {!funnel.available ? <p className="mt-2 text-[12px] text-neutral-muted">#5 기록 표가 아직 없어요(DB 반영 전).</p> : null}
    </div>
  );
}
