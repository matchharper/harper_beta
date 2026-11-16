import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cx } from "@/components/ops/theme";
import {
  OUTREACH_SOURCES,
  formatClickWait,
  formatKstMinute,
  outreachRate,
  type OutreachBounce,
  type OutreachFunnelMail,
  type OutreachFunnelNumbers,
  type OutreachSource,
} from "@/lib/gtmPlays/outreachFunnel";
import type { OutreachFunnel as OutreachFunnelData } from "@/lib/gtmPlays/outreachFunnel.server";
import { useGtmAction } from "./api";
import { Badge, Button, ErrorNotice, Hint, Panel, Select } from "./ui";

/** Header copy: what each number counts, what it leaves out, and what to decide from it. */
const HINTS = {
  role: "후보 메일을 보낸 Role이에요. 저장하지 않은 공고로 보낸 메일은 공고 이름으로 묶어요. 줄을 누르면 출처별 숫자와 메일 목록이 열려요.",
  sentGroup: "기간 안에 실제로 나간 후보 메일이에요. 회사 메일·30일 안 중복·수신 거부·하루 한도로 막힌 것과 @matchharper.com 테스트 메일은 빼요.",
  sent: "실제로 나간 메일 수예요.",
  bounced: "주소가 없거나 받는 쪽이 거절해서 돌아온 메일이에요(스팸 신고·발송 실패 포함). %는 보냄 중 비율이에요. 높은 출처는 이메일 찾기가 틀린 거예요.",
  unsubscribed: "메일을 받고 '연락 받지 않기'를 누른 사람이에요. 이 주소로는 다시 보내지 않아요. 많으면 대상이나 문구가 안 맞는 거예요.",
  reactionGroup: "후보가 메일을 보고 한 행동이에요.",
  clicked: "메일 버튼을 눌러 하퍼 공고 페이지를 연 사람이에요. 페이지가 1초 넘게 화면에 있었던 것만 세고, 봇·메일 보안 검사와 하퍼 직원이 연 건 빼요. %는 (보냄 − 반송) 중 비율이에요. 낮으면 제목·첫 문장을 바꿔 보세요.",
  signedUp: "그 메일로 가입(또는 로그인)하고 온보딩까지 마쳐서 공고가 인박스에 들어간 사람이에요. 하퍼 회원은 공고를 받은 거예요. %는 클릭 중 비율이에요. 낮으면 공고 페이지·가입 화면을 봐야 해요.",
  resultGroup: "회사가 실제로 얻는 것이에요.",
  reacted: "가입 뒤 그 공고를 저장·지원·연결·수락한 사람이에요(후보의 기회 단계).",
  connected: "그 후보가 이 Role(또는 인박스에 들어간 공고)의 회사와 하퍼에서 연결된 경우예요. 회사가 하퍼 고객일 때만 알 수 있어서, 외부 공고는 보통 0이에요.",
  total: "가입 ÷ 보냄이에요. 메일 100통에 몇 명이 들어오는지예요. 출처끼리 비교할 때 봐요.",
  wait: "보낸 뒤 클릭까지 걸린 시간의 중간값이에요. 이만큼 지나도 안 열었으면 후속 메일을 보낼 때예요.",
} as const;

const SOURCE_LABEL: Record<OutreachSource, string> = { member: "하퍼 회원", external: "외부 검색", scraped: "스크래핑 DB" };
const BOUNCE_LABEL: Record<OutreachBounce, string> = { bounced: "반송됨", complained: "스팸 신고", failed: "발송 실패" };
const STAGE_LABEL: Record<string, string> = {
  saved: "저장", applied: "지원", connected: "연결", offer: "오퍼", accepted: "수락", closed: "닫음", hidden: "숨김",
};
const PERIODS = [7, 30, 90] as const;

function HeaderLabel({ label, hint, align = "right" }: { label: string; hint: string; align?: "left" | "right" | "center" }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap",
      align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start")}
    >
      {/* Right-aligned numbers: ⓘ first, so the label ends where the numbers end. */}
      {align === "right" ? <Hint label={label} text={hint} /> : null}
      {label}
      {align === "right" ? null : <Hint label={label} text={hint} />}
    </span>
  );
}

function GroupHeader({ label, hint, span }: { label: string; hint: string; span: number }) {
  return (
    <th colSpan={span} className="px-2 pb-1 pt-1 font-normal">
      <div className="flex justify-center border-b border-neutral-1000-a10 pb-1">
        <HeaderLabel label={label} hint={hint} align="center" />
      </div>
    </th>
  );
}

/** "12 · 24%": the count, then its rate small and muted (no rate when there is nothing to divide by). */
function Count({ n, rate, strong = false }: { n: number; rate?: number | null; strong?: boolean }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={strong ? "font-medium" : undefined}>{n}</span>
      {rate !== undefined && rate !== null ? <span className="ml-1 text-[11px] text-neutral-muted">· {rate}%</span> : null}
    </span>
  );
}

const COLUMN_COUNT = 10;

function NumberCells({ numbers }: { numbers: OutreachFunnelNumbers }) {
  const reached = numbers.sent - numbers.bounced;
  const total = outreachRate(numbers.signedUp, numbers.sent);
  const cell = "px-2 py-1.5 text-right";
  return (
    <>
      <td className={cell}><Count n={numbers.sent} /></td>
      <td className={cell}><Count n={numbers.bounced} rate={outreachRate(numbers.bounced, numbers.sent)} /></td>
      <td className={cell}><Count n={numbers.unsubscribed} /></td>
      <td className={cell}><Count n={numbers.clicked} rate={outreachRate(numbers.clicked, reached)} /></td>
      <td className={cell}><Count n={numbers.signedUp} rate={outreachRate(numbers.signedUp, numbers.clicked)} strong /></td>
      <td className={cell}><Count n={numbers.reacted} /></td>
      <td className={cell}><Count n={numbers.connected} /></td>
      <td className={cx(cell, "font-medium tabular-nums")}>{total === null ? "—" : `${total}%`}</td>
      <td className={cx(cell, "tabular-nums text-neutral-muted")}>{formatClickWait(numbers.medianClickMs)}</td>
    </>
  );
}

/** The same columns for a set of rows (Roles, or one Role's sources), with ⓘ on every header. */
function FunnelTable({ firstLabel, firstHint, children }: { firstLabel: string; firstHint: string; children: ReactNode }) {
  return (
    <table className="w-full min-w-[980px] table-fixed text-sm">
      <colgroup>
        <col />
        <col className="w-16" />
        <col className="w-24" />
        <col className="w-20" />
        <col className="w-24" />
        <col className="w-24" />
        <col className="w-24" />
        <col className="w-20" />
        <col className="w-16" />
        <col className="w-20" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-bg-default text-left text-[12px] text-neutral-muted">
        <tr>
          <th />
          <GroupHeader label="보낸 메일" hint={HINTS.sentGroup} span={3} />
          <GroupHeader label="후보 반응" hint={HINTS.reactionGroup} span={2} />
          <GroupHeader label="공고 결과" hint={HINTS.resultGroup} span={2} />
          <th colSpan={2} />
        </tr>
        <tr>
          <th className="py-1.5 pr-3 font-normal"><HeaderLabel label={firstLabel} hint={firstHint} align="left" /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="보냄" hint={HINTS.sent} /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="반송" hint={HINTS.bounced} /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="수신 거부" hint={HINTS.unsubscribed} /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="클릭" hint={HINTS.clicked} /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="가입" hint={HINTS.signedUp} /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="관심·지원" hint={HINTS.reacted} /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="회사 연결" hint={HINTS.connected} /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="전체" hint={HINTS.total} /></th>
          <th className="px-2 py-1.5 text-right font-normal"><HeaderLabel label="클릭까지" hint={HINTS.wait} /></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-1000-a05">{children}</tbody>
    </table>
  );
}

/** One Role's mails of the period: who, from which source, and what each did. */
function RoleMails({ roleKey, days }: { roleKey: string; days: number }) {
  const list = useGtmAction<{ mails: OutreachFunnelMail[] }>();
  const { run } = list;
  useEffect(() => { void run("outreach.funnelMails", { roleKey, days }); }, [run, roleKey, days]);
  const mails = list.result?.mails ?? [];
  return (
    <div className="mt-4">
      <p className="mb-1 text-[12px] text-neutral-muted">보낸 메일{list.result ? ` ${mails.length}통` : ""}</p>
      <ErrorNotice message={list.error} />
      {list.loading && !list.result ? <p className="text-sm text-neutral-muted">불러오는 중</p> : null}
      {mails.length ? (
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 bg-bg-default text-left text-[12px] text-neutral-muted">
              <tr>
                <th className="py-1 pr-3 font-normal">받는 사람</th>
                <th className="py-1 pr-3 font-normal">출처</th>
                <th className="py-1 pr-3 font-normal">보낸 시각</th>
                <th className="py-1 pr-3 font-normal">반송·수신 거부</th>
                <th className="py-1 pr-3 font-normal">클릭</th>
                <th className="py-1 pr-3 font-normal">가입</th>
                <th className="py-1 font-normal">공고 결과</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-1000-a05">
              {mails.map((mail) => (
                <tr key={mail.id}>
                  <td className="py-1.5 pr-3">{mail.toEmail}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-neutral-muted">{mail.source ? SOURCE_LABEL[mail.source] : "—"}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{formatKstMinute(mail.sentAt)}</td>
                  <td className="py-1.5 pr-3">
                    <span className="flex flex-wrap gap-1">
                      {mail.bounce ? <Badge tone="critical">{BOUNCE_LABEL[mail.bounce]}</Badge> : null}
                      {mail.unsubscribed ? <Badge>수신 거부</Badge> : null}
                      {!mail.bounce && !mail.unsubscribed ? <span className="text-neutral-muted">—</span> : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{formatKstMinute(mail.clickedAt)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{formatKstMinute(mail.signedUpAt)}</td>
                  <td className="py-1.5">
                    <span className="flex flex-wrap gap-1">
                      {mail.stage ? <Badge>{STAGE_LABEL[mail.stage] ?? mail.stage}</Badge> : null}
                      {mail.connected ? <Badge tone="positive">회사 연결</Badge> : null}
                      {!mail.stage && !mail.connected ? <span className="text-neutral-muted">—</span> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : list.result ? <p className="text-sm text-neutral-muted">보낸 메일 없음</p> : null}
    </div>
  );
}

/**
 * #4 숫자 표: per Role, what the candidate mails of the period led to (보낸 메일 → 후보 반응 → 공고 결과), with a
 * 합계 row. A Role's row opens the same numbers per candidate source and its mails.
 */
export default function OutreachFunnel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [days, setDays] = useState<number>(30);
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useGtmAction<OutreachFunnelData>();
  const { run } = list;
  const load = useCallback(() => { void run("outreach.funnel", { days }); }, [run, days]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const data = list.result;
  const roles = data?.roles ?? [];
  const role = roles.find((row) => row.key === selected) ?? null;
  return (
    <Panel
      title={(
        <button type="button" className="inline-flex items-center gap-1" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          후보 메일 숫자{data ? ` · Role ${roles.length}개` : ""}
        </button>
      )}
      actions={open ? (
        <>
          <label className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[12px] text-neutral-muted">기간</span>
            <Select value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-32">
              {PERIODS.map((value) => <option key={value} value={value}>최근 {value}일</option>)}
            </Select>
          </label>
          <Button onClick={load} loading={list.loading}>새로고침</Button>
        </>
      ) : null}
    >
      {open ? (
        <>
          <ErrorNotice message={list.error} />
          {data && !data.available ? <p className="text-[12px] text-neutral-muted">보낸 기록 테이블은 배포 때 만들어져요.</p> : null}
          {data?.available && !data.clicksTracked ? (
            <p className="mb-2 text-[12px] text-neutral-muted">클릭 기록은 배포(20261117090000 마이그레이션) 뒤부터 세요. 그 전에는 0으로 보여요.</p>
          ) : null}
          {list.loading && !data ? <p className="text-sm text-neutral-muted">불러오는 중</p> : null}
          {data?.available ? (
            <div className="max-h-[60vh] overflow-auto">
              <FunnelTable firstLabel="Role" firstHint={HINTS.role}>
                {roles.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => setSelected(selected === row.key ? null : row.key)}
                    className={cx("cursor-pointer", selected === row.key ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
                  >
                    <td className="truncate py-1.5 pr-3" title={row.name}>{row.name}</td>
                    <NumberCells numbers={row.numbers} />
                  </tr>
                ))}
                {roles.length ? (
                  <tr className="font-medium">
                    <td className="py-1.5 pr-3">합계</td>
                    <NumberCells numbers={data.total} />
                  </tr>
                ) : (
                  <tr><td colSpan={COLUMN_COUNT} className="py-3 text-sm text-neutral-muted">이 기간에 보낸 후보 메일이 없어요.</td></tr>
                )}
              </FunnelTable>
            </div>
          ) : null}
          {role ? (
            <div className="mt-5 border-t border-neutral-1000-a05 pt-4">
              <p className="mb-2 text-sm font-medium">{role.name} · 출처별</p>
              <div className="overflow-auto">
                <FunnelTable firstLabel="출처" firstHint="후보를 찾은 곳이에요: 하퍼 회원 = 하퍼 계정 주소, 외부 검색 = 외부 검색 뒤 '이메일 찾기'로 찾은 주소, 스크래핑 DB = 모아 둔 프로필의 주소.">
                  {OUTREACH_SOURCES.map((source) => (
                    <tr key={source}>
                      <td className="py-1.5 pr-3">{SOURCE_LABEL[source]}</td>
                      <NumberCells numbers={role.bySource[source]} />
                    </tr>
                  ))}
                </FunnelTable>
              </div>
              <RoleMails key={`${role.key}|${days}|${refreshKey}`} roleKey={role.key} days={days} />
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
