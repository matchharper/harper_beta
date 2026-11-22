import { useEffect } from "react";
import type { ReactNode } from "react";
import { cx } from "@/components/ops/theme";
import type { AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import type {
  CompanyCell, CompanyRow, CompanyTable, CustomerColumn, OutsideColumn,
} from "@/lib/gtmPlays/agent/companyNumbers";
import type { AgentCompanyNumbers as CompanyNumbersResult } from "@/lib/gtmPlays/agent/companyNumbers.server";
import { useGtmAction } from "../api";
import { ErrorNotice, Hint } from "../ui";
import { Count, HeaderLabel } from "./numberCells";

/**
 * The same step has the same name in both tables (Shaun 11/22 16:38); each table counts what happens on its side
 * (16:54): outside, a company mail's events count mails ("N통"), the rest candidates (agent/companyNumbers.ts).
 */
const HINTS = {
  outside: "하퍼에 없는 회사예요. 후보가 동의하면 Ashley가 이름 없는 소개를 회사에 메일로 보내요.",
  customers: "이미 하퍼를 쓰는 회사예요. 회사 메일 없이 모든 일이 하퍼 안에서 오가요.",
  outsideCompany: "공고를 낸 회사예요(후보 메일의 공고에 적힌 이름). 회사 메일이 간 회사만 줄로 보이고, 공고만 간 회사는 합계에만 들어가요.",
  customerCompany: "하퍼에 공고를 올린 고객사예요(후보 메일에 적힌 이름). 등록된 이름이 다르면 마우스를 올리면 보여요.",
  received: "에이전트 메일로 이 회사 공고를 받은 후보 수예요. 합계에는 한 후보를 한 번만 세요.",
  mails: "Ashley가 회사에 보낸 메일 수예요(후보 수 아님). 후보가 동의하면 이름 없는 소개를 보내요. 한 회사에 하루 한 통이에요.",
  customerTold: "하퍼가 후보 대신 이 회사에 연락한 후보 수예요.",
  clicked: "회사가 메일 버튼으로 하퍼 페이지를 1초 넘게 본 메일 수예요. 메일을 열었는지는 알 수 없어요.",
  outsideAnswered: "회사가 답장한 회사 메일 수예요.",
  customerAnswered: "회사에 알린 후보 중 회사가 하퍼에서 한 번 이상 답한 후보 수예요.",
  relayed: "회사가 답장에 쓴 말을 Ashley가 후보에게 전한 후보 수예요.",
  signedUp: "회사가 메일 버튼으로 하퍼에 가입한 메일 수예요.",
  outsideRequested: "회사 메일로 가입한 회사가 하퍼에서 이 후보에게 연결을 요청한 후보 수예요.",
  customerRequested: "회사가 하퍼에서 이 후보에게 연결을 요청한 후보 수예요.",
  outsideConnected: "회사의 연결 요청을 후보가 확인해 연결된 후보 수예요. 가장 중요한 숫자예요.",
  customerConnected: "이 회사와 하퍼에서 연결된 후보 수예요. 가장 중요한 숫자예요.",
  delivery: "반송 / 스팸 신고 / 수신 거부된 회사 메일 수예요. 스팸 신고가 한 건이라도 오면 회사 메일을 모두 멈춰요.",
  customerInterested: "이 회사 공고를 하퍼에서 저장하거나 지원한 후보 수예요(회사 연결까지 간 후보 포함).",
  messages: "후보 → 회사 / 회사 → 후보 메시지 수예요(이 칸만 후보 수가 아니에요). 취소된 건 빼요.",
} as const;

type Pick = (ids: string[], label: string) => void;

/** A number that opens its people in the log (the ids behind it); 0 opens no one, so it is plain text. */
function PickCell({ cell, label, onPick, title, strong }: { cell: CompanyCell; label: string; onPick: Pick; title?: string; strong?: boolean }) {
  return (
    <td className="px-2 py-1.5 text-right align-top">
      <PickNumber cell={cell} label={label} onPick={onPick} title={title}><Count n={cell.n} strong={strong} /></PickNumber>
    </td>
  );
}

function PickNumber({ cell, label, onPick, title, children }: { cell: CompanyCell; label: string; onPick: Pick; title?: string; children?: ReactNode }) {
  if (!cell.n) return <span className="px-1 tabular-nums text-neutral-muted">0</span>;
  return (
    <button type="button" title={title ?? "눌러서 이 후보들 보기"} onClick={() => onPick(cell.ids, label)} className="rounded px-1 tabular-nums hover:bg-bg-weak hover:underline">
      {children ?? cell.n}
    </button>
  );
}

/** A cell of company mails: the number is mails ("N통"), the click opens the candidates they were about. */
const mailTitle = (cell: CompanyCell) => `메일 ${cell.n}통 · 후보 ${cell.ids.length}명 · 눌러서 그 후보들 보기`;

function MailCell({ cell, label, onPick }: { cell: CompanyCell; label: string; onPick: Pick }) {
  return (
    <td className="px-2 py-1.5 text-right align-top">
      <PickNumber cell={cell} label={label} onPick={onPick} title={mailTitle(cell)}>{cell.n}통</PickNumber>
    </td>
  );
}

/** One table: 합계 first, then a row per company (Shaun 11/17: the total is the first row). */
function CompanyTableView<C extends string>({ table, scope, companyHint, columns, row, minWidth }: {
  table: CompanyTable<C>;
  /** The table's name for the 합계 row's log chip ("하퍼 고객사 합계 · 연결 요청"). */
  scope: string;
  companyHint: string;
  columns: ReactNode;
  row: (cells: Record<C, CompanyCell>, name: string, strong: boolean) => ReactNode;
  minWidth: string;
}) {
  const lines: Array<{ key: string; label: ReactNode; title?: string; name: string; cells: Record<C, CompanyCell>; strong: boolean }> = [
    { key: "total", label: "합계", name: `${scope} 합계`, cells: table.total, strong: true },
    ...table.companies.map((company: CompanyRow<C>) => ({
      key: company.key, label: company.name, name: company.name, cells: company.cells, strong: false,
      title: company.registeredName ? `하퍼에 등록된 이름: ${company.registeredName}` : undefined,
    })),
  ];
  return (
    <div className="overflow-x-auto">
      <table className={cx("w-full text-sm", minWidth)}>
        <thead className="text-left text-[12px] text-neutral-muted">
          <tr>
            <th className="py-1.5 pr-3 font-normal"><HeaderLabel label="회사" hint={companyHint} align="left" /></th>
            {columns}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-1000-a05">
          {lines.map((line) => (
            <tr key={line.key} className={cx(line.strong && "bg-bg-weak font-medium")}>
              <td className="py-1.5 pr-3" title={line.title}>{line.label}</td>
              {row(line.cells, line.name, line.strong)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = (label: string, hint: string) => (
  <th key={label} className="px-2 py-1.5 text-right font-normal"><HeaderLabel label={label} hint={hint} /></th>
);

function OutsideTable({ table, onPick }: { table: CompanyTable<OutsideColumn>; onPick: Pick }) {
  return (
    <CompanyTableView
      table={table}
      scope="하퍼 밖 회사"
      companyHint={HINTS.outsideCompany}
      minWidth="min-w-[1100px]"
      columns={(
        <>
          {th("공고 받은 후보", HINTS.received)}
          {th("회사 메일", HINTS.mails)}
          {th("회사 클릭", HINTS.clicked)}
          {th("회사 답", HINTS.outsideAnswered)}
          {th("후보에게 전달", HINTS.relayed)}
          {th("회사 가입", HINTS.signedUp)}
          {th("회사가 연결 요청", HINTS.outsideRequested)}
          {th("회사 연결", HINTS.outsideConnected)}
          {th("반송/스팸 신고/수신 거부", HINTS.delivery)}
        </>
      )}
      row={(cells, name, strong) => (
        <>
          <PickCell cell={cells.received} label={`${name} · 공고 받은 후보`} onPick={onPick} strong={strong} />
          <MailCell cell={cells.mails} label={`${name} · 회사 메일`} onPick={onPick} />
          <MailCell cell={cells.clicked} label={`${name} · 회사 클릭`} onPick={onPick} />
          <MailCell cell={cells.answered} label={`${name} · 회사 답`} onPick={onPick} />
          <PickCell cell={cells.relayed} label={`${name} · 후보에게 전달`} onPick={onPick} />
          <MailCell cell={cells.signedUp} label={`${name} · 회사 가입`} onPick={onPick} />
          <PickCell cell={cells.companyRequested} label={`${name} · 회사가 연결 요청`} onPick={onPick} />
          <PickCell cell={cells.connected} label={`${name} · 회사 연결`} onPick={onPick} strong />
          <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums" title="반송 / 스팸 신고 / 수신 거부 (메일 수)">
            <PickNumber cell={cells.bounced} label={`${name} · 반송`} onPick={onPick} title={mailTitle(cells.bounced)} />/
            <PickNumber cell={cells.complained} label={`${name} · 스팸 신고`} onPick={onPick} title={mailTitle(cells.complained)} />/
            <PickNumber cell={cells.unsubscribed} label={`${name} · 수신 거부`} onPick={onPick} title={mailTitle(cells.unsubscribed)} />통
          </td>
        </>
      )}
    />
  );
}

function CustomerTable({ table, onPick }: { table: CompanyTable<CustomerColumn>; onPick: Pick }) {
  const messageTitle = (cell: CompanyCell, who: string) => `${who} 메시지 ${cell.n}개 · 후보 ${cell.ids.length}명 · 눌러서 그 후보들 보기`;
  return (
    <CompanyTableView
      table={table}
      scope="하퍼 고객사"
      companyHint={HINTS.customerCompany}
      minWidth="min-w-[960px]"
      columns={(
        <>
          {th("공고 받은 후보", HINTS.received)}
          {th("관심·지원", HINTS.customerInterested)}
          {th("회사에 알린 후보", HINTS.customerTold)}
          {th("회사 답", HINTS.customerAnswered)}
          {th("회사가 연결 요청", HINTS.customerRequested)}
          {th("회사 연결", HINTS.customerConnected)}
          {th("하퍼 안 메시지", HINTS.messages)}
        </>
      )}
      row={(cells, name, strong) => (
        <>
          <PickCell cell={cells.received} label={`${name} · 공고 받은 후보`} onPick={onPick} strong={strong} />
          <PickCell cell={cells.interested} label={`${name} · 관심·지원`} onPick={onPick} />
          <PickCell cell={cells.told} label={`${name} · 회사에 알린 후보`} onPick={onPick} />
          <PickCell cell={cells.answered} label={`${name} · 회사 답`} onPick={onPick} />
          <PickCell cell={cells.companyRequested} label={`${name} · 회사가 연결 요청`} onPick={onPick} />
          <PickCell cell={cells.connected} label={`${name} · 회사 연결`} onPick={onPick} strong />
          <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums">
            <PickNumber cell={cells.toCompany} label={`${name} · 후보가 보낸 메시지`} onPick={onPick} title={messageTitle(cells.toCompany, "후보 쪽이 보낸")} />
            <span className="text-neutral-muted">/</span>
            <PickNumber cell={cells.toTalent} label={`${name} · 회사가 보낸 메시지`} onPick={onPick} title={messageTitle(cells.toTalent, "회사가 보낸")} />
          </td>
        </>
      )}
    />
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-2 flex items-center gap-1 text-[13px] font-medium">{title}<Hint label={title} text={hint} /></span>
      {children}
    </div>
  );
}

/**
 * #5 수치 · 회사 (Shaun 11/22): what the period's candidates led to on the company side. 하퍼 밖 회사 (Ashley's company
 * mails to companies not on Harper, and what came of them) and 하퍼 고객사 (everything inside Harper between the
 * candidate's side and the customer), each 합계 first and then a row per company (agent/companyNumbers.ts). Every number
 * opens the people behind it in the log (`onPick` with their ids and a label for the log's chip). The panel around it
 * (title, period) is the caller's.
 */
export default function AgentCompanyNumbers({ period, refreshKey, onPick }: {
  /** This panel's own period (agent/PeriodPicker.tsx periodInput). */
  period: AgentPeriodInput;
  refreshKey: number;
  /** A number: the gtm_agent_people ids behind it and a short label ("고객사 A · 연결 요청"). */
  onPick: (ids: string[], label: string) => void;
}) {
  const numbers = useGtmAction<CompanyNumbersResult>();
  const { run } = numbers;
  // Test rows never count on the screen (Shaun 11/17).
  useEffect(() => { void run("agent.companyNumbers", { ...period, includeTest: false }); }, [run, period, refreshKey]);
  const data = numbers.result;
  return (
    <div>
      <ErrorNotice message={numbers.error} />
      {data ? (
        <div className="space-y-5">
          <Section title="하퍼 밖 회사" hint={HINTS.outside}>
            {data.outside.companies.length
              ? <OutsideTable table={data.outside} onPick={onPick} />
              : <p className="text-[12px] text-neutral-muted">이 기간에 나간 회사 메일이 없어요</p>}
          </Section>
          <Section title="하퍼 고객사" hint={HINTS.customers}>
            {data.customers.companies.length
              ? <CustomerTable table={data.customers} onPick={onPick} />
              : <p className="text-[12px] text-neutral-muted">이 기간에 고객사로 이어진 후보가 없어요</p>}
          </Section>
          {!data.available ? <p className="text-[12px] text-neutral-muted">아직 기록을 저장할 곳이 준비되지 않았어요(배포 전).</p> : null}
        </div>
      ) : numbers.loading ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
    </div>
  );
}
