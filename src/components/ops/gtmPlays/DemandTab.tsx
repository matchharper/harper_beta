import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type {
  DemandCompany,
  DemandPerson,
  DemandRecipients,
  DemandRole,
  DemandRoleDetail,
} from "@/lib/gtmPlays/demand.server";
import { orgCompanyUrl, orgRoleUrl, type DemandCounts } from "@/lib/gtmPlays/demandLinks";
import type { AnonymousCard, CompanyMailDraft } from "@/lib/gtmPlays/shared";
import { formatKst, gtmCall, useGtmAction } from "./api";
import { CompanyMail } from "./CompanyMail";
import { Badge, Button, ErrorNotice, Hint, Panel, Select } from "./ui";

type DemandListResult = { days: number; companies: DemandCompany[]; tookMs: number };
type Selection = { workspaceId: string; roleId: string | null };

const NO_CARDS: AnonymousCard[] = [];

/** What each number is (the /org name and rule), and what Chris decides from it. */
const HINTS = {
  list: "하퍼 고객사(하퍼 회사 계정이 있는 회사)와 그 회사의 /org Role이에요. 숫자는 /org 화면과 같은 계산(회사 owner가 보는 숫자)이에요. 회사를 기다리는 후보(연결을 기다리는 + 연결을 요청할 + 외부 후보)가 많은 순이고, 적어도 다 보여요.",
  roles: "회사 아래 줄은 /org에 열린 Role(진행 중)이에요. 0이어도 보여요. '하퍼가 만든 Role'은 하퍼가 그 회사 대신 만든 Role이에요. '펼쳐보기'에는 닫힌 Role(멈춤·끝남·초안 중 숫자가 있는 것)과 채용 사이트 공고 활동이 있어요. Role을 누르면 오른쪽에 그 Role의 후보와 회사 메일이 나와요.",
  waiting: "/org '연결을 기다리는 후보' 탭과 같은 수예요. 후보가 이미 만나 보겠다고 했고, 회사가 연결만 하면 돼요(회사가 저장한 후보는 빼요). 가장 급해요: 오래 두면 후보가 식어요. 이 숫자가 있으면 먼저 회사에 알려요.",
  toRequest: "/org '연결을 요청할 후보' 탭과 같은 수예요. 하퍼가 이 Role에 맞다고 올렸고, 회사가 '연결 요청'을 누를지 정할 후보예요(회사가 저장한 후보는 빼요). 쌓였는데 회사가 안 보고 있으면 메일로 들어와 보게 해요.",
  external: "/org '외부 후보' 탭과 같은 조건이에요. 하퍼 밖(LinkedIn 등)에서 찾아 이 Role에 보여 준 사람 중 회사가 거절하지 않은 사람이에요.",
  saved: "/org '저장' 수예요. 회사가 나중에 보려고 저장한 후보로, 위 두 숫자에는 안 들어가요. 정렬에서는 다음 순서예요.",
  site: "하퍼가 회사 채용 사이트에서 모아 온 공고(하퍼 /org Role 아님)에 기간 안에 하퍼 회원이 지원(하퍼 대신 지원 제출, 또는 '지원함' 표시)하거나 저장만 한 사람 수예요. /org 숫자와는 따로예요.",
  people: "이 사람들은 /org가 그 Role에 보여 주는 사람과 같아요(이름은 내부 확인용이에요). 메일에는 숫자만 들어가고 누구인지는 안 들어가요.",
} as const;

const ROLE_STATUS: Record<string, string> = {
  active: "진행 중", top_priority: "진행 중", paused: "멈춤", ended: "끝남", draft: "초안",
};

const INTRO_STATUS: Record<string, string> = {
  requested: "연결 요청됨", sending: "초대 보내는 중", invited: "초대 보냄", replied: "답장 옴", accepted: "수락",
  connecting: "연결 중", connected: "연결됨", declined: "거절", not_sendable: "못 보냄", failed: "실패",
  bounced: "반송", unsubscribed: "수신 거부", cancelled: "취소",
};

const NUMBER_COLUMNS: Array<{ key: keyof DemandCounts; label: string; hint: string }> = [
  { key: "waiting", label: "연결을 기다리는 후보", hint: HINTS.waiting },
  { key: "toRequest", label: "연결을 요청할 후보", hint: HINTS.toRequest },
  { key: "external", label: "외부 후보", hint: HINTS.external },
  { key: "saved", label: "저장", hint: HINTS.saved },
];

/** Numbers are right-aligned, so the ⓘ goes before the label and the label's end lines up with them. */
function HeaderCell({ label, hint, right = true, className }: { label: string; hint: string; right?: boolean; className?: string }) {
  return (
    <th className={cx("py-1.5 align-bottom font-normal", right ? "px-2 text-right" : "pr-3", className)}>
      <span className={cx("inline-flex items-center gap-1", right && "justify-end")}>
        {right ? <Hint label={label} text={hint} /> : null}
        <span className={right ? "leading-4" : "whitespace-nowrap"}>{label}</span>
        {right ? null : <Hint label={label} text={hint} />}
      </span>
    </th>
  );
}

function NumberCells({ counts, className, strong = false }: { counts: DemandCounts; className?: string; strong?: boolean }) {
  return (
    <>
      {NUMBER_COLUMNS.map((column) => (
        <td
          key={column.key}
          className={cx(
            "px-2 text-right tabular-nums", className,
            column.key === "saved" || !counts[column.key] ? "text-neutral-muted" : strong && "font-semibold",
          )}
        >
          {counts[column.key]}
        </td>
      ))}
    </>
  );
}

function Fact({ label, hint, value }: { label: string; hint: string; value: ReactNode }) {
  return (
    <div className={cx(opsTheme.panelMuted, "px-3 py-2")}>
      <div className="flex items-center gap-1 text-[12px] text-neutral-muted">
        <span className="truncate">{label}</span>
        <Hint label={label} text={hint} />
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Facts({ counts }: { counts: DemandCounts }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {NUMBER_COLUMNS.map((column) => <Fact key={column.key} label={column.label} hint={column.hint} value={counts[column.key]} />)}
    </div>
  );
}

function roleLabel(role: Pick<DemandRole, "tailored">) {
  return role.tailored ? "하퍼가 만든 Role" : "하퍼 Role";
}

function PeopleList({ title, hint, people, atLabel }: { title: string; hint: string; people: DemandPerson[]; atLabel: string }) {
  return (
    <section className="mt-4">
      <div className="mb-1 flex items-center gap-1 text-[12px] font-medium text-neutral-muted">
        {title} {people.length}명<Hint label={title} text={hint} />
      </div>
      {people.length ? (
        <ul className={cx("max-h-64 divide-y overflow-auto text-sm", opsTheme.divider)}>
          {people.map((person) => (
            <li key={person.talentId} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">
                <span className="font-medium">{person.name ?? "-"}</span>
                {person.headline ? <span className="text-neutral-muted"> · {person.headline}</span> : null}
              </span>
              <span className="shrink-0 text-[12px] text-neutral-muted">{atLabel} {formatKst(person.at)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-neutral-muted">없음</p>}
    </section>
  );
}

function demandDraft(args: { workspaceId: string; roleId: string | null; days: number }) {
  return async (language: "ko" | "en") =>
    (await gtmCall<{ draft: CompanyMailDraft }>("demand.mail", { ...args, language })).draft;
}

function DemandMail({ workspaceId, roleId, companyName, homepageUrl, ctaUrl, recipients, days, writes }: {
  workspaceId: string; roleId: string | null; companyName: string; homepageUrl: string | null; ctaUrl: string;
  recipients: DemandRecipients; days: number; writes: boolean;
}) {
  return (
    <CompanyMail
      key={`${workspaceId}|${roleId ?? "company"}`}
      campaign="demand"
      companyName={companyName}
      homepageUrl={homepageUrl}
      postingEmails={recipients.postingEmails}
      accountMembers={recipients.members}
      cards={NO_CARDS}
      postingTitle={null}
      companyWorkspaceId={workspaceId}
      roleId={roleId}
      ctaUrl={ctaUrl}
      writes={writes}
      draft={demandDraft({ workspaceId, roleId, days })}
    />
  );
}

/** One Role: its /org numbers, the people behind them, a link into /org, and the mail about this Role. */
function RoleDetail({ workspaceId, roleId, days, writes }: { workspaceId: string; roleId: string; days: number; writes: boolean }) {
  const load = useGtmAction<{ detail: DemandRoleDetail }>();
  const { run } = load;
  useEffect(() => { void run("demand.role", { workspaceId, roleId }); }, [run, workspaceId, roleId]);
  const detail = load.result?.detail;
  if (!detail || detail.role.roleId !== roleId) {
    return <Panel><ErrorNotice message={load.error} />{load.loading ? <p className="text-sm text-neutral-muted">/org 숫자 읽는 중</p> : null}</Panel>;
  }
  const { role, company } = detail;
  const orgUrl = orgRoleUrl({ workspaceId, roleId, counts: role.counts });
  return (
    <div className="space-y-4">
      <Panel
        title={(
          <span className="flex flex-wrap items-center gap-2">
            <span>{role.name}</span>
            <Badge tone={role.open ? "positive" : "default"}>{ROLE_STATUS[role.status] ?? role.status}</Badge>
            <span className="text-sm font-normal text-neutral-muted">{company.companyName} · {roleLabel(role)}</span>
          </span>
        )}
        actions={(
          <a className={cx(opsTheme.link, "inline-flex items-center gap-1 text-sm")} href={orgUrl} target="_blank" rel="noreferrer">
            /org에서 보기 <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      >
        {detail.readError ? <p className={cx(opsTheme.errorNotice, "mb-2")}>{detail.readError}</p> : null}
        <Facts counts={role.counts} />
        <PeopleList title="연결을 기다리는 후보" hint={`${HINTS.waiting} ${HINTS.people}`} people={detail.waiting} atLabel="기다린 지" />
        <PeopleList title="연결을 요청할 후보" hint={`${HINTS.toRequest} ${HINTS.people}`} people={detail.toRequest} atLabel="올린 날" />
        <section className="mt-4">
          <div className="mb-1 flex items-center gap-1 text-[12px] font-medium text-neutral-muted">
            외부 후보 {detail.external.length}명<Hint label="외부 후보" text={HINTS.external} />
          </div>
          {detail.external.length ? (
            <ul className={cx("max-h-64 divide-y overflow-auto text-sm", opsTheme.divider)}>
              {detail.external.map((person) => (
                <li key={person.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{person.name ?? "-"}</span>
                    {[person.headline, person.currentCompany].filter(Boolean).length
                      ? <span className="text-neutral-muted"> · {[person.headline, person.currentCompany].filter(Boolean).join(" · ")}</span>
                      : null}
                  </span>
                  <span className="shrink-0 text-[12px] text-neutral-muted">
                    {person.introStatus ? INTRO_STATUS[person.introStatus] ?? person.introStatus : person.decision === "requested" ? "연결 요청됨" : "회사 결정 전"}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-neutral-muted">없음</p>}
        </section>
      </Panel>
      <DemandMail
        workspaceId={workspaceId}
        roleId={roleId}
        companyName={company.companyName}
        homepageUrl={company.homepageUrl}
        ctaUrl={orgRoleUrl({ workspaceId, roleId, counts: role.counts, utm: true })}
        recipients={detail}
        days={days}
        writes={writes}
      />
    </div>
  );
}

/** One company: totals over its Roles, the Roles (click to open one), and a mail about the whole account. */
function CompanyDetail({ workspaceId, days, writes, onRole }: {
  workspaceId: string; days: number; writes: boolean; onRole: (roleId: string) => void;
}) {
  const load = useGtmAction<{ detail: DemandRecipients & { company: DemandCompany } }>();
  const { run } = load;
  useEffect(() => { void run("demand.company", { workspaceId, days }); }, [run, workspaceId, days]);
  const detail = load.result?.detail;
  if (!detail || detail.company.workspaceId !== workspaceId) {
    return <Panel><ErrorNotice message={load.error} />{load.loading ? <p className="text-sm text-neutral-muted">/org 숫자 읽는 중</p> : null}</Panel>;
  }
  const c = detail.company;
  return (
    <div className="space-y-4">
      <Panel
        title={c.companyName}
        actions={(
          <>
            <a className={cx(opsTheme.link, "inline-flex items-center gap-1 text-sm")} href={orgCompanyUrl({ workspaceId })} target="_blank" rel="noreferrer">
              /org에서 보기 <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            {c.homepageUrl ? <a className={cx(opsTheme.link, "text-sm")} href={c.homepageUrl} target="_blank" rel="noreferrer">홈페이지</a> : null}
          </>
        )}
      >
        {c.readError ? <p className={cx(opsTheme.errorNotice, "mb-2")}>{c.readError}</p> : null}
        <Facts counts={c.counts} />
        <div className="mt-4 mb-1 text-[12px] font-medium text-neutral-muted">Role {c.roles.length}개 · 누르면 Role로 가요</div>
        <ul className={cx("divide-y text-sm", opsTheme.divider)}>
          {c.roles.map((role) => (
            <li key={role.roleId}>
              <button type="button" onClick={() => onRole(role.roleId)} className="flex w-full items-baseline justify-between gap-3 py-1.5 text-left hover:bg-bg-weak/70">
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 text-[11px] text-neutral-soft">{roleLabel(role)}</span>
                  {role.name}
                  {role.open ? null : <span className="ml-1 text-[11px] text-neutral-soft">({ROLE_STATUS[role.status] ?? role.status})</span>}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-neutral-muted">
                  기다리는 {role.counts.waiting} · 요청할 {role.counts.toRequest} · 외부 {role.counts.external} · 저장 {role.counts.saved}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {c.sitePostings ? (
          <p className="mt-3 flex items-center gap-1 text-[12px] text-neutral-muted">
            채용 사이트 공고 (하퍼 미등록) {c.sitePostings.postings}개 · 최근 {days}일 하퍼 회원 지원 {c.sitePostings.applied}명 · 저장만 {c.sitePostings.savedOnly}명
            <Hint label="채용 사이트 공고" text={HINTS.site} />
          </p>
        ) : null}
      </Panel>
      <DemandMail
        workspaceId={workspaceId}
        roleId={null}
        companyName={c.companyName}
        homepageUrl={c.homepageUrl}
        ctaUrl={orgCompanyUrl({ workspaceId, utm: true })}
        recipients={detail}
        days={days}
        writes={writes}
      />
    </div>
  );
}

/** #3 관심 쌓인 고객사: 고객사·Role별 /org 숫자 → Role 눌러 후보 확인 → 회사에 메일. */
export default function DemandTab({ writes }: { writes: boolean }) {
  const [days, setDays] = useState(90);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const list = useGtmAction<DemandListResult>();
  const { run } = list;
  const load = useCallback(() => { void run("demand.list", { days }); }, [run, days]);
  useEffect(() => { load(); }, [load]);
  const result = list.result;
  const companies = result?.companies ?? [];
  // The detail follows the period the list was loaded with, not a control still being changed.
  const shownDays = result?.days ?? days;
  const toggle = (workspaceId: string) => setExpanded((ids) => (ids.includes(workspaceId)
    ? ids.filter((id) => id !== workspaceId) : [...ids, workspaceId]));
  return (
    <div className={cx("grid gap-4", selected && "xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]")}>
      <Panel
        title={<span className="inline-flex items-center gap-1">하퍼 고객사 {companies.length}곳<Hint label="하퍼 고객사" text={HINTS.list} /></span>}
        actions={(
          <>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm">
              <span className="inline-flex items-center gap-1 text-[12px] text-neutral-muted">채용 사이트 활동 기간<Hint label="기간" text={HINTS.site} /></span>
              <Select value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-32" aria-label="채용 사이트 활동 기간">
                {[7, 14, 30, 60, 90, 180].map((value) => <option key={value} value={value}>최근 {value}일</option>)}
              </Select>
            </label>
            <Button onClick={load} loading={list.loading}>새로고침</Button>
          </>
        )}
      >
        <ErrorNotice message={list.error} />
        {list.loading && !result ? <p className="text-sm text-neutral-muted">회사마다 /org 숫자를 읽고 있어요 (10초쯤 걸려요)</p> : null}
        {result ? <p className="mb-2 text-[12px] text-neutral-soft">/org 숫자는 지금 기준 · 읽는 데 {(result.tookMs / 1000).toFixed(1)}초</p> : null}
        <div className="max-h-[75vh] overflow-auto">
          <table className="w-full min-w-[560px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-20" />
              <col className="w-16" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-bg-default text-left text-[12px] text-neutral-muted">
              <tr>
                <HeaderCell label="회사 · Role" hint={HINTS.roles} right={false} />
                {NUMBER_COLUMNS.map((column) => <HeaderCell key={column.key} label={column.label} hint={column.hint} />)}
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => {
                const companySelected = selected?.workspaceId === company.workspaceId && !selected.roleId;
                const openRoles = company.roles.filter((role) => role.open);
                const closedRoles = company.roles.filter((role) => !role.open);
                const foldCount = closedRoles.length + (company.sitePostings ? 1 : 0);
                const isExpanded = expanded.includes(company.workspaceId);
                const roleRow = (role: DemandRole) => {
                  const roleSelected = selected?.workspaceId === company.workspaceId && selected.roleId === role.roleId;
                  return (
                    <tr
                      key={role.roleId}
                      onClick={() => setSelected({ workspaceId: company.workspaceId, roleId: role.roleId })}
                      aria-selected={roleSelected}
                      className={cx("cursor-pointer text-[13px]", roleSelected ? "bg-bg-weak" : "text-neutral-muted hover:bg-bg-weak/70")}
                    >
                      <td className="truncate py-0.5 pl-4 pr-3" title={role.name}>
                        <span className="mr-1.5 text-[11px] text-neutral-soft">{roleLabel(role)}</span>
                        <span className={roleSelected ? "font-medium text-neutral-primary" : undefined}>{role.name}</span>
                        {role.open ? null : <span className="ml-1 text-[11px] text-neutral-soft">({ROLE_STATUS[role.status] ?? role.status})</span>}
                      </td>
                      <NumberCells counts={role.counts} className="py-0.5" />
                    </tr>
                  );
                };
                return (
                  <Fragment key={company.workspaceId}>
                    <tr
                      onClick={() => setSelected({ workspaceId: company.workspaceId, roleId: null })}
                      aria-selected={companySelected}
                      className={cx("cursor-pointer border-t border-neutral-1000-a05", companySelected ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
                    >
                      <td className="truncate pb-1 pr-3 pt-2 font-medium" title={company.companyName}>
                        {company.companyName}
                        <span className="ml-1.5 text-[12px] font-normal text-neutral-muted">열린 Role {openRoles.length}개</span>
                        {company.readError ? <span className="ml-1.5 text-[12px] font-normal text-critical" title={company.readError}>숫자 못 읽음</span> : null}
                      </td>
                      <NumberCells counts={company.counts} className="pb-1 pt-2" strong />
                    </tr>
                    {openRoles.map(roleRow)}
                    {foldCount ? (
                      <tr onClick={() => toggle(company.workspaceId)} className="cursor-pointer text-[12px] text-neutral-soft hover:text-neutral-muted">
                        <td className="py-0.5 pb-1.5 pl-4" colSpan={5}>
                          {isExpanded ? "▾ 접기" : "▸ 펼쳐보기"}
                          {" · "}
                          {[closedRoles.length ? `닫힌 Role ${closedRoles.length}개` : null,
                            company.sitePostings ? "채용 사이트 공고 활동" : null].filter(Boolean).join(" · ")}
                        </td>
                      </tr>
                    ) : null}
                    {isExpanded ? closedRoles.map(roleRow) : null}
                    {isExpanded && company.sitePostings ? (
                      <tr className="text-[12px] text-neutral-muted">
                        <td className="py-0.5 pb-1.5 pl-4" colSpan={5}>
                          <span className="mr-1.5 text-[11px] text-neutral-soft">하퍼 미등록</span>
                          채용 사이트 공고 {company.sitePostings.postings}개 · 최근 {shownDays}일 하퍼 회원 지원 {company.sitePostings.applied}명 · 저장만 {company.sitePostings.savedOnly}명
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {selected && result ? (
        selected.roleId ? (
          <RoleDetail key={`${selected.workspaceId}|${selected.roleId}`} workspaceId={selected.workspaceId} roleId={selected.roleId} days={shownDays} writes={writes} />
        ) : (
          <CompanyDetail
            key={selected.workspaceId}
            workspaceId={selected.workspaceId}
            days={shownDays}
            writes={writes}
            onRole={(roleId) => setSelected({ workspaceId: selected.workspaceId, roleId })}
          />
        )
      ) : null}
    </div>
  );
}
